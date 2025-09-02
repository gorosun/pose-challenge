import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, AlertCircle } from 'lucide-react';

interface BGMPlayerProps {
  audioSrc: string;
  volume?: number;
}

const BGMPlayer: React.FC<BGMPlayerProps> = ({ audioSrc, volume = 0.3 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(volume);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 音量設定
    audio.volume = isMuted ? 0 : currentVolume;

    // 音声ファイルのロード状態を監視
    const handleLoadStart = () => {
      setIsLoading(true);
      setHasError(false);
    };

    const handleCanPlayThrough = () => {
      setIsLoading(false);
      setHasError(false);
    };

    const handleLoadError = (e: Event) => {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('音楽ファイルの読み込みに失敗しました');
      console.error('Audio load error:', e);
    };

    // 再生状態の監視
    const handlePlay = () => {
      setIsPlaying(true);
      setHasError(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleAbort = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };

    // イベントリスナーの追加
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('error', handleLoadError);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('abort', handleAbort);

    // 音量変更時のエラーハンドリング
    const handleVolumeError = (e: Event) => {
      console.warn('Volume change error:', e);
    };
    audio.addEventListener('volumechange', handleVolumeError);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('error', handleLoadError);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('abort', handleAbort);
      audio.removeEventListener('volumechange', handleVolumeError);
    };
  }, [currentVolume, isMuted]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        // ユーザーのインタラクションによる再生開始
        const playPromise = audio.play();

        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    } catch (error) {
      console.error('Audio play failed:', error);
      setHasError(true);
      setErrorMessage(
        '音楽の再生に失敗しました。ブラウザの設定を確認してください。'
      );
    }
  };

  const toggleMute = () => {
    if (hasError) return;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasError) return;

    const newVolume = parseFloat(e.target.value);
    setCurrentVolume(newVolume);
    if (isMuted) setIsMuted(false);
  };

  // キーボードショートカット
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'KeyM':
        e.preventDefault();
        toggleMute();
        break;
    }
  };

  // エラー時の再試行
  const retryLoad = () => {
    const audio = audioRef.current;
    if (!audio) return;

    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    audio.load(); // 音声ファイルを再読み込み
  };

  return (
    <div
      className="bgm-player"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="BGM音楽プレイヤー"
    >
      <audio
        ref={audioRef}
        src={audioSrc}
        loop
        preload="auto"
        crossOrigin="anonymous"
      />

      <div className="bgm-controls">
        {/* 再生/一時停止ボタン */}
        <button
          onClick={togglePlayPause}
          className={`bgm-button ${hasError ? 'disabled' : ''}`}
          title={
            hasError
              ? 'エラーが発生しています'
              : isLoading
              ? '読み込み中...'
              : isPlaying
              ? '一時停止 (Space)'
              : '再生 (Space)'
          }
          disabled={hasError || isLoading}
          aria-label={isPlaying ? '音楽を一時停止' : '音楽を再生'}
        >
          {hasError ? (
            <AlertCircle size={16} />
          ) : isLoading ? (
            <div className="loading-spinner-small" />
          ) : isPlaying ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}
        </button>

        {/* ミュートボタン */}
        <button
          onClick={toggleMute}
          className={`bgm-button ${hasError ? 'disabled' : ''}`}
          title={
            hasError
              ? 'エラーが発生しています'
              : isMuted
              ? 'ミュート解除 (M)'
              : 'ミュート (M)'
          }
          disabled={hasError}
          aria-label={isMuted ? 'ミュートを解除' : 'ミュート'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* 音量スライダー */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={isMuted ? 0 : currentVolume}
          onChange={handleVolumeChange}
          className={`volume-slider ${hasError ? 'disabled' : ''}`}
          title="音量調整"
          disabled={hasError}
          aria-label={`音量: ${Math.round(
            (isMuted ? 0 : currentVolume) * 100
          )}%`}
        />

        {/* 音量表示 */}
        <span className="volume-display" aria-hidden="true">
          {Math.round((isMuted ? 0 : currentVolume) * 100)}%
        </span>
      </div>

      {/* エラーメッセージとリトライボタン */}
      {hasError && (
        <div className="bgm-error">
          <p className="error-text">{errorMessage}</p>
          <button onClick={retryLoad} className="retry-button" title="再試行">
            再試行
          </button>
        </div>
      )}
    </div>
  );
};

export default BGMPlayer;
