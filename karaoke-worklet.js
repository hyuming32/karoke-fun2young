class KaraokeMixer extends AudioWorkletProcessor {
  constructor(){super();this.tracks={};this.frames=0;this.playing=false;this.gain={vocal:0,music:0,original:0};this.target={...this.gain};this.step={vocal:0,music:0,original:0};this.resumeGoals={...this.gain};this.pauseAfterFade=false;this.pendingSeek=null;this.report=0;this.port.onmessage=e=>this.command(e.data);}
  command(m){
    if(m.type==='load'){this.tracks[m.track]={pcm:new Int16Array(m.buffer),frames:m.frames,sourceFrames:m.sourceFrames??m.frames,ratio:(m.sourceRate??sampleRate)/sampleRate};this.port.postMessage({type:'loaded',track:m.track});}
    else if(m.type==='mix'){const goals=m.mode==='original'?{vocal:0,music:0,original:m.original??1}:{vocal:m.vocal,music:m.music,original:0};this.resumeGoals={...goals};if(this.playing&&!this.pauseAfterFade&&!this.pendingSeek)this.ramp(goals,m.fade||40);}
    else if(m.type==='play'){this.pauseAfterFade=false;if(this.pendingSeek){this.pendingSeek.wasPlaying=true;}else{this.playing=true;this.ramp(this.resumeGoals,40);}}
    else if(m.type==='pause'){if(this.pendingSeek)this.pendingSeek.wasPlaying=false;this.pauseAfterFade=true;this.ramp({vocal:0,music:0,original:0},m.fade||40);}
    else if(m.type==='seek'){this.pendingSeek={frame:m.frame,wasPlaying:!this.pauseAfterFade&&(this.pendingSeek?.wasPlaying??this.playing)};this.ramp({vocal:0,music:0,original:0},m.fade||40);}
    else if(m.type==='clear'){this.playing=false;this.tracks={};this.frames=0;}
  }
  ramp(goals,ms){const count=Math.max(1,Math.round(sampleRate*ms/1000));for(const k of ['vocal','music','original']){this.target[k]=goals[k];this.step[k]=(goals[k]-this.gain[k])/count;}}
  process(_inputs,outputs){const out=outputs[0];if(!out||out.length<2)return true;const l=out[0],r=out[1],v=this.tracks.vocal,m=this.tracks.music,o=this.tracks.original,tracks=[[v,'vocal'],[m,'music'],[o,'original']];for(let i=0;i<l.length;i++){
      for(const k of ['vocal','music','original']){const d=this.target[k]-this.gain[k];if(Math.abs(d)<Math.abs(this.step[k]))this.gain[k]=this.target[k];else this.gain[k]+=this.step[k];}
      if(this.playing){if(this.frames>=Math.min(v?.frames??Infinity,m?.frames??Infinity,o?.frames??Infinity)){this.playing=false;if(!this.pendingSeek&&!this.pauseAfterFade)this.port.postMessage({type:'position',frame:this.frames,ended:true});}else{let a=0,b=0;
        for(const [track,key] of tracks){
          if(!track||this.gain[key]===0)continue;
          const offset=this.frames*track.ratio, frame=Math.min(track.sourceFrames-1,Math.floor(offset));
          const ix=frame*2, next=Math.min(track.sourceFrames-1,frame+1)*2;
          const fraction=Math.min(1,offset-frame),gain=this.gain[key]/32768;
          a+=(track.pcm[ix]+(track.pcm[next]-track.pcm[ix])*fraction)*gain;
          b+=(track.pcm[ix+1]+(track.pcm[next+1]-track.pcm[ix+1])*fraction)*gain;
        }
        l[i]=Math.max(-1,Math.min(1,a));r[i]=Math.max(-1,Math.min(1,b));this.frames++;} }
      else{l[i]=0;r[i]=0;}
      if(this.gain.vocal===0&&this.gain.music===0&&this.gain.original===0&&this.pendingSeek){const s=this.pendingSeek;this.pendingSeek=null;this.frames=s.frame;this.playing=s.wasPlaying;this.pauseAfterFade=false;if(this.playing)this.ramp(this.resumeGoals,40);this.port.postMessage({type:'seeked',frame:this.frames});}
      if(this.pauseAfterFade&&this.gain.vocal===0&&this.gain.music===0&&this.gain.original===0){this.playing=false;this.pauseAfterFade=false;this.port.postMessage({type:'position',frame:this.frames});}
    }this.report+=l.length;if(this.report>=2048){this.report=0;this.port.postMessage({type:'position',frame:this.frames});}return true;}
}
registerProcessor('karaoke-mixer',KaraokeMixer);
