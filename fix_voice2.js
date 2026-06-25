const fs = require('fs');
const path = require('path');

// 1. Fix VoiceChatScreen.tsx
const vcPath = path.join(__dirname, 'src/screens/agent/VoiceChatScreen.tsx');
let vcContent = fs.readFileSync(vcPath, 'utf8');

// Replace expo-speech with AudioQueuePlayer
vcContent = vcContent.replace(/let SpeechModule: any = null;[\s\S]*?try \{[\s\S]*?SpeechModule = require\('expo-speech'\);[\s\S]*?\} catch \(e\) \{[\s\S]*?\}/, 'import { AudioQueuePlayer } from \'../../services/AudioQueuePlayer\';');

vcContent = vcContent.replace(/const \[isSpeaking, setIsSpeaking\] = useState\(false\);/, 'const [isSpeaking, setIsSpeaking] = useState(false);\n  const audioPlayer = React.useRef<AudioQueuePlayer | null>(null);\n\n  React.useEffect(() => {\n    audioPlayer.current = new AudioQueuePlayer(() => setIsSpeaking(false));\n    return () => {\n      audioPlayer.current?.stopAll();\n    };\n  }, []);');

vcContent = vcContent.replace(/const speakReply = async \(text: string\) => \{[\s\S]*?if \(!SpeechModule\) return;[\s\S]*?try \{[\s\S]*?if \(isSpeaking\) \{[\s\S]*?await SpeechModule\.stop\(\);[\s\S]*?\}[\s\S]*?setIsSpeaking\(true\);[\s\S]*?SpeechModule\.speak\(text, \{[\s\S]*?language: 'en',[\s\S]*?rate: 1\.0,[\s\S]*?onDone: \(\) => setIsSpeaking\(false\),[\s\S]*?onStopped: \(\) => setIsSpeaking\(false\),[\s\S]*?onError: \(\) => setIsSpeaking\(false\),[\s\S]*?\}\);[\s\S]*?\} catch \(err\) \{[\s\S]*?console\.error\('TTS Error:', err\);[\s\S]*?setIsSpeaking\(false\);[\s\S]*?\}[\s\S]*?\};/, `const speakReply = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    const sentences = text.match(/[^。！？.!?]+[。！？.!?]*/g) || [text];
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i].trim();
      if (!s) continue;
      const encodedText = encodeURIComponent(s);
      const audioUri = \`\${API_BASE}/voice/tts?text=\${encodedText}\`;
      audioPlayer.current?.enqueue(audioUri);
    }
  };`);

// Handle SpeechModule.stop overrides
vcContent = vcContent.replace(/if \(isSpeaking && SpeechModule\) \{[\s\S]*?await SpeechModule\.stop\(\);[\s\S]*?\}/g, 'if (isSpeaking) { audioPlayer.current?.stopAll(); }');
vcContent = vcContent.replace(/SpeechModule\.isSpeakingAsync\(\)/g, 'isSpeaking');

fs.writeFileSync(vcPath, vcContent);
console.log('VoiceChatScreen.tsx patched');

// 2. Fix voice.controller.ts
const ctrlPath = path.join(__dirname, 'backend/src/modules/voice/voice.controller.ts');
let ctrlContent = fs.readFileSync(ctrlPath, 'utf8');

if (!ctrlContent.includes("@Get('tts')")) {
  ctrlContent = ctrlContent.replace(/import \{[\s\S]*?\} from '@nestjs\/common';/, `import { Controller, Post, Get, Query, Res, UseInterceptors, UploadedFile, UseGuards, BadRequestException } from '@nestjs/common';\nimport { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';\nimport { Response } from 'express';`);

  const ttsMethod = `
  @Get('tts')
  async synthesizeTTS(@Query('text') text: string, @Res() res: Response) {
    if (!text) throw new BadRequestException('Text is required');
    try {
      const polly = new PollyClient({ region: 'us-east-1' }); 
      const command = new SynthesizeSpeechCommand({
        Engine: 'neural',
        VoiceId: 'Matthew',
        LanguageCode: 'zh-CN',
        OutputFormat: 'mp3',
        Text: text,
      });
      const response = await polly.send(command);
      if (response.AudioStream) {
         res.set({
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked'
        });
        (response.AudioStream as any).pipe(res);
      } else {
        throw new Error('No audio stream returned');
      }
    } catch (error) {
      console.error('TTS Synthesis error', error);
      res.status(500).json({ message: 'TTS Synthesis failed' });
    }
  }
`;
  ctrlContent = ctrlContent.replace(/constructor\(private readonly voiceService: VoiceService\) \{\}/, `constructor(private readonly voiceService: VoiceService) {}\n${ttsMethod}`);
  fs.writeFileSync(ctrlPath, ctrlContent);
  console.log('voice.controller.ts patched');
}
