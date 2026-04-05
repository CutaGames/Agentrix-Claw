import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { API_BASE_URL } from '../../../lib/api/client';

interface VoiceOutputProps {
  text: string;
  language?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
}

/**
 * 语音输出组件（P0功能）
 * 统一走后端 /voice/tts，避免 Web 端继续分叉到浏览器原生 TTS。
 */
export function VoiceOutput({
  text,
  language = 'zh-CN',
  autoPlay = false,
  onComplete,
}: VoiceOutputProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && typeof Audio !== 'undefined');
  }, []);

  const releaseAudio = useCallback(() => {
    const currentAudio = audioRef.current;
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = '';
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoPlay && text && isSupported) {
      void speak();
    }

    return () => {
      releaseAudio();
    };
  }, [autoPlay, isSupported, releaseAudio, text]);

  const speak = useCallback(async () => {
    if (!isSupported || !text) return;

    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) {
      throw new Error('请先登录后再使用语音播放');
    }

    releaseAudio();
    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/voice/tts?text=${encodeURIComponent(text.slice(0, 2000))}&lang=${encodeURIComponent(language)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`语音合成失败 (${response.status})`);
      }

      const audioBlob = await response.blob();
      const objectUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.onended = () => {
        releaseAudio();
        setIsPlaying(false);
        setIsLoading(false);
        onComplete?.();
      };

      audio.onerror = () => {
        releaseAudio();
        setIsPlaying(false);
        setIsLoading(false);
      };

      setIsPlaying(true);
      await audio.play();
    } catch (error) {
      releaseAudio();
      setIsPlaying(false);
      setIsLoading(false);
      throw error;
    }
  }, [isSupported, language, onComplete, releaseAudio, text]);

  const stop = () => {
    releaseAudio();
    setIsPlaying(false);
    setIsLoading(false);
  };

  const toggle = () => {
    if (isPlaying) {
      stop();
    } else {
      void speak().catch((error) => {
        console.error('Voice playback error:', error);
      });
    }
  };

  if (!isSupported || !text) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`
        flex items-center justify-center
        w-8 h-8 rounded-full
        transition-all duration-200
        ${
          isPlaying
            ? 'bg-indigo-500 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
        }
      `}
      title={isPlaying ? '停止播放' : '播放语音'}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isPlaying ? (
        <Pause size={16} />
      ) : (
        <Play size={16} />
      )}
    </button>
  );
}

