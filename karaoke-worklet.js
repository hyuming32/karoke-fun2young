class KaraokeMixer extends AudioWorkletProcessor {
  constructor(){super();this.tracks={};this.frames=0;this.playing=false;this.gain={vocal:0,music:0,original:0};this.target={...this.gain};this.step={vocal:0,music:0,original:0};this.resumeGoals={...this.gain};this.pauseAfterFade=false;this.pendingSeek=null;this.report=0;this.rate=1;this.pitch=1;this.nextRate=1;this.nextPitch=1;this.hop=Math.round(sampleRate*.024);this.phase=0;this.previous=0;this.current=0;this.grainsReady=false;this.port.onmessage=e=>this.command(e.data);}
  command(m){
    if(m.type==='load'){this.tracks[m.track]={pcm:new Int16Array(m.buffer),frames:m.frames,sourceFrames:m.sourceFrames??m.frames,ratio:(m.sourceRate??sampleRate)/sampleRate};this.port.postMessage({type:'loaded',track:m.track});}
    else if(m.type==='mix'){const goals=m.mode==='original'?{vocal:0,music:0,original:m.original??1}:{vocal:m.vocal,music:m.music,original:0};this.resumeGoals={...goals};if(this.playing&&!this.pauseAfterFade&&!this.pendingSeek)this.ramp(goals,m.fade||40);}
    else if(m.type==='play'){this.pauseAfterFade=false;if(this.pendingSeek){this.pendingSeek.wasPlaying=true;}else{this.playing=true;this.ramp(this.resumeGoals,40);}}
    else if(m.type==='pause'){if(this.pendingSeek)this.pendingSeek.wasPlaying=false;this.pauseAfterFade=true;this.ramp({vocal:0,music:0,original:0},m.fade||40);}
    else if(m.type==='seek'){this.pendingSeek={frame:m.frame,wasPlaying:!this.pauseAfterFade&&(this.pendingSeek?.wasPlaying??this.playing)};this.ramp({vocal:0,music:0,original:0},m.fade||40);}
    else if(m.type==='practice'){this.nextRate=m.rate;this.nextPitch=m.pitch;}
    else if(m.type==='clear'){this.playing=false;this.tracks={};this.frames=0;}
  }
  ramp(goals,ms){const count=Math.max(1,Math.round(sampleRate*ms/1000));for(const k of ['vocal','music','original']){this.target[k]=goals[k];this.step[k]=(goals[k]-this.gain[k])/count;}}
  sample(track,position,channel){
    const offset=position*track.ratio;
    if(offset<0||offset>=track.sourceFrames)return 0;
    const frame=Math.floor(offset),index=frame*2+channel;
    const next=Math.min(track.sourceFrames-1,frame+1)*2+channel;
    return track.pcm[index]+(track.pcm[next]-track.pcm[index])*(offset-frame);
  }
  // Align the incoming grain to the existing one, using one reference
  // track so every stem and both stereo channels stay locked together.
  align(reference,start,previous){
    if(!reference||start<0||start+2*this.hop>=reference.frames)return start;
    const radius=Math.round(sampleRate*.008);
    let best=start,bestScore=-Infinity;
    for(let shift=-radius;shift<=radius;shift+=8){
      let dot=0,aa=0,bb=0;
      for(let j=0;j<this.hop;j+=32){
        const a=this.sample(reference,previous+j*this.pitch,0);
        const b=this.sample(reference,start+shift+j*this.pitch,0);
        dot+=a*b;aa+=a*a;bb+=b*b;
      }
      if(aa*bb===0)continue;
      const score=dot/Math.sqrt(aa*bb)-.04*Math.abs(shift)/radius;
      if(score>bestScore){bestScore=score;best=start+shift;}
    }
    return best;
  }
  process(_inputs,outputs){const out=outputs[0];if(!out||out.length<2)return true;const l=out[0],r=out[1],v=this.tracks.vocal,m=this.tracks.music,o=this.tracks.original,tracks=[[v,'vocal'],[m,'music'],[o,'original']];for(let i=0;i<l.length;i++){
      for(const k of ['vocal','music','original']){const d=this.target[k]-this.gain[k];if(Math.abs(d)<Math.abs(this.step[k]))this.gain[k]=this.target[k];else this.gain[k]+=this.step[k];}
      if(this.playing){if(this.frames>=Math.min(v?.frames??Infinity,m?.frames??Infinity,o?.frames??Infinity)){this.playing=false;if(!this.pendingSeek&&!this.pauseAfterFade)this.port.postMessage({type:'position',frame:this.frames,rate:this.rate,ended:true});}else{let a=0,b=0;
        if(!this.grainsReady||this.phase===0){
          this.rate=this.nextRate;
          if(!this.grainsReady){
            this.previous=this.frames-this.hop*this.nextPitch;
            this.previousPitch=this.nextPitch;
            this.grainsReady=true;
          }else{
            this.previous=this.current;
            this.previousPitch=this.pitch;
          }
          this.pitch=this.nextPitch;
          const reference=this.target.original>0?o:this.target.music>0?m:v;
          this.current=this.rate===1&&this.pitch===1?this.frames:
            this.align(reference,this.frames,this.previous+this.hop*this.previousPitch);
        }
        const direct=this.rate===1&&this.pitch===1&&this.previousPitch===1&&this.previous+this.hop===this.current;
        const blend=direct?1:this.phase/this.hop;
        const current=this.current+this.phase*this.pitch;
        const previous=this.previous+(this.phase+this.hop)*this.previousPitch;
        for(const [track,key] of tracks){
          if(!track||this.gain[key]===0)continue;
          const gain=this.gain[key]/32768;
          a+=(this.sample(track,current,0)*blend+(direct?0:this.sample(track,previous,0)*(1-blend)))*gain;
          b+=(this.sample(track,current,1)*blend+(direct?0:this.sample(track,previous,1)*(1-blend)))*gain;
        }
        this.phase=(this.phase+1)%this.hop;
        l[i]=Math.max(-1,Math.min(1,a));r[i]=Math.max(-1,Math.min(1,b));this.frames+=this.rate;} }
      else{l[i]=0;r[i]=0;}
      if(this.gain.vocal===0&&this.gain.music===0&&this.gain.original===0&&this.pendingSeek){const s=this.pendingSeek;this.pendingSeek=null;this.frames=s.frame;this.phase=0;this.grainsReady=false;this.playing=s.wasPlaying;this.pauseAfterFade=false;if(this.playing)this.ramp(this.resumeGoals,40);this.port.postMessage({type:'seeked',frame:this.frames,rate:this.rate});}
      if(this.pauseAfterFade&&this.gain.vocal===0&&this.gain.music===0&&this.gain.original===0){this.playing=false;this.pauseAfterFade=false;this.port.postMessage({type:'position',frame:this.frames,rate:this.rate});}
    }this.report+=l.length;if(this.report>=2048){this.report=0;this.port.postMessage({type:'position',frame:this.frames,rate:this.rate});}return true;}
}
registerProcessor('karaoke-mixer',KaraokeMixer);
