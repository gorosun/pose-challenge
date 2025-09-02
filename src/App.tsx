import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import { Upload, RotateCcw, Loader } from 'lucide-react';
import './App.css';
import BGMPlayer from './BGMPlayer';

interface Keypoint {
  x: number;
  y: number;
  score: number;
  name?: string;
}

interface DetectedPose {
  keypoints: Keypoint[];
  score: number;
}

const App: React.FC = () => {
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(
    null
  );
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [targetImage, setTargetImage] = useState<HTMLImageElement | null>(null);
  const [challengeImage, setChallengeImage] = useState<HTMLImageElement | null>(
    null
  );
  const [targetPose, setTargetPose] = useState<DetectedPose | null>(null);
  const [challengePose, setChallengePose] = useState<DetectedPose | null>(null);
  const [detectingTarget, setDetectingTarget] = useState(false);
  const [detectingChallenge, setDetectingChallenge] = useState(false);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [prevSimilarity, setPrevSimilarity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTargetImage, setShowTargetImage] = useState(true);
  const [showChallengeImage, setShowChallengeImage] = useState(true);

  // ドラッグ状態の管理
  const [isDraggingTarget, setIsDraggingTarget] = useState(false);
  const [isDraggingChallenge, setIsDraggingChallenge] = useState(false);

  // 効果音用ref
  const scoreSoundRef = useRef<HTMLAudioElement | null>(null);

  const canvasRef1 = useRef<HTMLCanvasElement>(null);
  const canvasRef2 = useRef<HTMLCanvasElement>(null);

  const keypointNames = [
    'nose',
    'left_eye',
    'right_eye',
    'left_ear',
    'right_ear',
    'left_shoulder',
    'right_shoulder',
    'left_elbow',
    'right_elbow',
    'left_wrist',
    'right_wrist',
    'left_hip',
    'right_hip',
    'left_knee',
    'right_knee',
    'left_ankle',
    'right_ankle',
  ];

  useEffect(() => {
    const initializeModel = async () => {
      try {
        setIsModelLoading(true);
        setError(null);

        await tf.ready();
        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        };

        const detector = await poseDetection.createDetector(
          model,
          detectorConfig
        );
        setDetector(detector);
      } catch (err) {
        setError(
          `初期化失敗: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setIsModelLoading(false);
      }
    };

    initializeModel();

    // 効果音のプリロード
    scoreSoundRef.current = new Audio('/audio/scoring.mp3');
    scoreSoundRef.current.volume = 0.5;
    scoreSoundRef.current.preload = 'auto';

    return () => {
      if (scoreSoundRef.current) {
        scoreSoundRef.current = null;
      }
    };
  }, []);

  // 効果音再生関数
  const playScoreSound = () => {
    if (scoreSoundRef.current) {
      scoreSoundRef.current.currentTime = 0;
      scoreSoundRef.current.play().catch((error) => {
        console.log('Score sound play failed:', error);
      });
    }
  };

  // 共通のファイル処理関数
  const processFile = async (file: File, isTarget: boolean) => {
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = async () => {
        if (isTarget) {
          setTargetImage(img);
          setTargetPose(null);
          if (detector) {
            await detectPose(img, true);
          }
        } else {
          setChallengeImage(img);
          setChallengePose(null);
          if (detector) {
            await detectPose(img, false);
          }
        }
        setSimilarity(null);
        setError(null);
      };

      img.onerror = () => setError('画像の読み込みに失敗しました');
      img.src = e.target?.result as string;
    };

    reader.onerror = () => setError('ファイルの読み込みに失敗しました');
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    isTarget: boolean
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file, isTarget);
  };

  // ドラッグアンドドロップイベントハンドラー
  const handleDragOver = (e: React.DragEvent, isTarget: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTarget) {
      setIsDraggingTarget(true);
    } else {
      setIsDraggingChallenge(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent, isTarget: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      if (isTarget) {
        setIsDraggingTarget(false);
      } else {
        setIsDraggingChallenge(false);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, isTarget: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (isTarget) {
      setIsDraggingTarget(false);
    } else {
      setIsDraggingChallenge(false);
    }

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((file) => file.type.startsWith('image/'));

    if (imageFile) {
      processFile(imageFile, isTarget);
    } else {
      setError('画像ファイルをドロップしてください');
    }
  };

  const detectPose = async (image: HTMLImageElement, isTarget: boolean) => {
    if (!detector || !image) return;

    if (isTarget) {
      setDetectingTarget(true);
    } else {
      setDetectingChallenge(true);
    }
    setError(null);

    try {
      const poses = await detector.estimatePoses(image);

      if (poses.length === 0) {
        throw new Error('人物が検出されませんでした');
      }

      const pose: DetectedPose = {
        keypoints: poses[0].keypoints.map((kp, index) => ({
          x: kp.x,
          y: kp.y,
          score: kp.score || 0,
          name: keypointNames[index],
        })),
        score: poses[0].score || 0,
      };

      if (isTarget) {
        setTargetPose(pose);
      } else {
        setChallengePose(pose);
      }

      const canvas = isTarget ? canvasRef1.current : canvasRef2.current;
      drawPose(canvas, pose, image, isTarget);
    } catch (err) {
      setError(
        `${isTarget ? 'ターゲット' : 'チャレンジ'}ポーズの検出に失敗: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      if (isTarget) {
        setDetectingTarget(false);
      } else {
        setDetectingChallenge(false);
      }
    }
  };

  // MoveNetキーポイント順序に対応したカラーマップ
  const moveNetColors: { [key: number]: string } = {
    0: '#FF0000',  // nose - 赤
    1: '#FF00FF',  // left_eye - マゼンタ
    2: '#FF00FF',  // right_eye - マゼンタ
    3: '#8000FF',  // left_ear - 紫
    4: '#8000FF',  // right_ear - 紫
    5: '#00FFFF',  // left_shoulder - シアン
    6: '#FF8000',  // right_shoulder - オレンジ
    7: '#00FF00',  // left_elbow - 緑
    8: '#FFFF00',  // right_elbow - 黄
    9: '#80FF80',  // left_wrist - 薄緑
    10: '#FF4000', // right_wrist - 赤オレンジ
    11: '#0000FF', // left_hip - 青
    12: '#00FF00', // right_hip - 緑
    13: '#0080FF', // left_knee - 水色
    14: '#80FF80', // right_knee - 薄緑
    15: '#8080FF', // left_ankle - 薄青
    16: '#00FFFF', // right_ankle - シアン
  };

  const drawPose = (
    canvas: HTMLCanvasElement | null,
    pose: DetectedPose,
    image: HTMLImageElement,
    isTarget: boolean = true
  ) => {
    if (!canvas || !pose) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fixedHeight = 300;
    const imageAspect = image.width / image.height;
    const canvasWidth = Math.round(fixedHeight * imageAspect);

    canvas.width = canvasWidth;
    canvas.height = fixedHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 画像表示の制御
    const shouldShowImage = isTarget ? showTargetImage : showChallengeImage;
    
    if (shouldShowImage) {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const scaleX = canvas.width / image.width;
    const scaleY = canvas.height / image.height;

    const connections = [
      [5, 6],   // left_shoulder - right_shoulder
      [5, 7],   // left_shoulder - left_elbow
      [7, 9],   // left_elbow - left_wrist
      [6, 8],   // right_shoulder - right_elbow
      [8, 10],  // right_elbow - right_wrist
      [5, 11],  // left_shoulder - left_hip
      [6, 12],  // right_shoulder - right_hip
      [11, 12], // left_hip - right_hip
      [11, 13], // left_hip - left_knee
      [13, 15], // left_knee - left_ankle
      [12, 14], // right_hip - right_knee
      [14, 16], // right_knee - right_ankle
    ];

    // 接続線を色分けして描画
    connections.forEach(([i, j]) => {
      const kp1 = pose.keypoints[i];
      const kp2 = pose.keypoints[j];

      if (kp1.score > 0.3 && kp2.score > 0.3) {
        // 肩の水平ライン（left_shoulder - right_shoulder）は赤色に
        let lineColor;
        if ((i === 5 && j === 6) || (i === 6 && j === 5)) {
          lineColor = '#FF0000'; // 赤色
        } else {
          // その他の接続線は最初のキーポイントの色を使用
          lineColor = moveNetColors[i] || '#22c55e';
        }
        
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 5;
        ctx.moveTo(kp1.x * scaleX, kp1.y * scaleY);
        ctx.lineTo(kp2.x * scaleX, kp2.y * scaleY);
        ctx.stroke();
      }
    });


    // キーポイントを色分けして描画
    pose.keypoints.forEach((keypoint, index) => {
      if (keypoint.score > 0.3) {
        const pointColor = moveNetColors[index] || '#ef4444';
        
        ctx.beginPath();
        ctx.fillStyle = pointColor;
        ctx.shadowColor = pointColor;
        ctx.shadowBlur = 8;
        ctx.arc(keypoint.x * scaleX, keypoint.y * scaleY, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  };

  const calculateSimilarity = (
    pose1: DetectedPose,
    pose2: DetectedPose
  ): number => {
    const validPairs: number[] = [];

    const pose1ValidCount = pose1.keypoints.filter(
      (kp) => kp.score > 0.3
    ).length;
    const pose2ValidCount = pose2.keypoints.filter(
      (kp) => kp.score > 0.3
    ).length;

    const minValidCount = Math.min(pose1ValidCount, pose2ValidCount);
    const maxPossibleKeypoints = 17;

    const detectionQuality = minValidCount / maxPossibleKeypoints;

    if (minValidCount < 8) {
      const severePenalty = minValidCount / 8;
      const qualityPenalty = detectionQuality * severePenalty;

      pose1.keypoints.forEach((kp1, index) => {
        const kp2 = pose2.keypoints[index];
        if (kp1.score > 0.3 && kp2.score > 0.3) {
          const dx = (kp1.x - kp2.x) / 100;
          const dy = (kp1.y - kp2.y) / 100;
          const distance = Math.sqrt(dx * dx + dy * dy);
          validPairs.push(distance);
        }
      });

      if (validPairs.length === 0) return 0;

      const avgDistance =
        validPairs.reduce((sum, d) => sum + d, 0) / validPairs.length;
      const baseSimilarity = Math.max(0, (1 - avgDistance / 5) * 100);

      return Math.round(baseSimilarity * qualityPenalty);
    }

    pose1.keypoints.forEach((kp1, index) => {
      const kp2 = pose2.keypoints[index];
      if (kp1.score > 0.3 && kp2.score > 0.3) {
        const dx = (kp1.x - kp2.x) / 100;
        const dy = (kp1.y - kp2.y) / 100;
        const distance = Math.sqrt(dx * dx + dy * dy);
        validPairs.push(distance);
      }
    });

    if (validPairs.length === 0) return 0;

    const avgDistance =
      validPairs.reduce((sum, d) => sum + d, 0) / validPairs.length;
    const baseSimilarity = Math.max(0, (1 - avgDistance / 5) * 100);

    const finalScore = baseSimilarity * detectionQuality;

    return Math.round(finalScore);
  };

  // スコア計算と効果音再生
  useEffect(() => {
    if (targetPose && challengePose) {
      const sim = calculateSimilarity(targetPose, challengePose);
      setSimilarity(sim);

      if (prevSimilarity !== sim) {
        playScoreSound();
        setPrevSimilarity(sim);
      }
    }
  }, [targetPose, challengePose, prevSimilarity]);

  // 画像表示状態変更時にcanvasを再描画
  useEffect(() => {
    if (targetImage && targetPose) {
      drawPose(canvasRef1.current, targetPose, targetImage, true);
    }
  }, [showTargetImage, targetImage, targetPose]);

  useEffect(() => {
    if (challengeImage && challengePose) {
      drawPose(canvasRef2.current, challengePose, challengeImage, false);
    }
  }, [showChallengeImage, challengeImage, challengePose]);

  const getScoreMessage = (score: number) => {
    if (score >= 90) return '完璧！';
    if (score >= 80) return '素晴らしい！';
    if (score >= 70) return 'とても良い！';
    if (score >= 60) return '良い感じ！';
    if (score >= 50) return '悪くない！';
    return '練習しよう！';
  };

  const resetGame = () => {
    setTargetImage(null);
    setChallengeImage(null);
    setTargetPose(null);
    setChallengePose(null);
    setSimilarity(null);
    setPrevSimilarity(null);
    setError(null);
    setDetectingTarget(false);
    setDetectingChallenge(false);
    setIsDraggingTarget(false);
    setIsDraggingChallenge(false);
    setShowTargetImage(true);
    setShowChallengeImage(true);

    [canvasRef1, canvasRef2].forEach((ref) => {
      if (ref.current) {
        const ctx = ref.current.getContext('2d');
        ctx?.clearRect(0, 0, ref.current.width, ref.current.height);
      }
    });
  };

  if (isModelLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br loading-container">
        <div className="loading-content">
          <div className="loading-spinner animate-spin"></div>
          <p className="loading-text">AI初期化中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br">
      <div className="container">
        <header className="header">
          <h1 className="main-title">ポーズチャレンジ</h1>
          <p className="subtitle">
            MoveNet AIでカメラアングルとポーズを比較しよう
          </p>
          <div className="header-bgm">
            <BGMPlayer audioSrc="/audio/bgm.mp3" volume={0.3} />
          </div>
        </header>

        {error && <div className="error-box">{error}</div>}

        <div className="grid">
          {/* Target Pose */}
          <div className="pose-card">
            <h2 className="section-title">ターゲットポーズ</h2>

            <div
              className={`file-upload-area ${targetImage ? 'has-file' : ''} ${
                isDraggingTarget ? 'dragging' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, true)}
              onDragEnter={handleDragEnter}
              onDragLeave={(e) => handleDragLeave(e, true)}
              onDrop={(e) => handleDrop(e, true)}
            >
              <div className="file-input-container">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, true)}
                  className="file-input"
                  id="target-upload"
                />
                <Upload className="upload-icon" />
              </div>
              <p className="upload-text">
                {detectingTarget
                  ? 'ポーズ検出中...'
                  : isDraggingTarget
                  ? '画像をドロップしてください'
                  : 'クリック または ドラッグ&ドロップで画像をアップロード'}
              </p>
            </div>

            {detectingTarget && (
              <div
                className="detect-button"
                style={{ justifyContent: 'center', marginBottom: '1rem' }}
              >
                <Loader
                  className="animate-spin"
                  style={{ width: '1rem', height: '1rem' }}
                />
                自動検出中...
              </div>
            )}

            {targetImage && (
              <div>
                <canvas ref={canvasRef1} className="pose-canvas" />
                {targetPose && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'rgba(255,255,255,0.8)',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <button
                      onClick={() => setShowTargetImage(!showTargetImage)}
                      className="toggle-button"
                      title="画像表示切替"
                    >
                      {showTargetImage ? 'ON' : 'OFF'}
                    </button>
                    <span>
                      検出完了:{' '}
                      {targetPose.keypoints.filter((kp) => kp.score > 0.3).length}
                      /17 キーポイント
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Challenge Pose */}
          <div className="pose-card" style={{ position: 'relative' }}>
            <div className="section-title-container">
              <h2 className="section-title">チャレンジポーズ</h2>
              {similarity !== null && (
                <div className="title-score">{similarity}%</div>
              )}
            </div>

            <div
              className={`file-upload-area ${
                challengeImage ? 'has-file' : ''
              } ${isDraggingChallenge ? 'dragging' : ''}`}
              onDragOver={(e) => handleDragOver(e, false)}
              onDragEnter={handleDragEnter}
              onDragLeave={(e) => handleDragLeave(e, false)}
              onDrop={(e) => handleDrop(e, false)}
            >
              <div className="file-input-container">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, false)}
                  className="file-input"
                  id="challenge-upload"
                />
                <Upload className="upload-icon" />
              </div>
              <p className="upload-text">
                {detectingChallenge
                  ? 'ポーズ検出中...'
                  : isDraggingChallenge
                  ? '画像をドロップしてください'
                  : 'クリック または ドラッグ&ドロップで画像をアップロード'}
              </p>
            </div>

            {detectingChallenge && (
              <div
                className="detect-button"
                style={{ justifyContent: 'center', marginBottom: '1rem' }}
              >
                <Loader
                  className="animate-spin"
                  style={{ width: '1rem', height: '1rem' }}
                />
                自動検出中...
              </div>
            )}

            {challengeImage && (
              <div style={{ position: 'relative' }}>
                <canvas ref={canvasRef2} className="pose-canvas" />
                {challengePose && (
                  <div>
                    {/* 検出完了とトグルボタンの行 */}
                    <div
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.875rem',
                        color: 'rgba(255,255,255,0.8)',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <button
                        onClick={() => setShowChallengeImage(!showChallengeImage)}
                        className="toggle-button"
                        title="画像表示切替"
                      >
                        {showChallengeImage ? 'ON' : 'OFF'}
                      </button>
                      <span>
                        検出完了:{' '}
                        {challengePose.keypoints.filter((kp) => kp.score > 0.3).length}
                        /17 キーポイント
                      </span>
                    </div>
                    
                    {/* スコアメッセージの行 */}
                    {similarity !== null && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          color: '#ffd700',
                          fontWeight: 'bold',
                          fontSize: '1.25rem',
                          textAlign: 'center',
                        }}
                      >
                        {getScoreMessage(similarity)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="reset-container">
          <button onClick={resetGame} className="reset-button">
            <RotateCcw style={{ width: '1.25rem', height: '1.25rem' }} />
            リセット
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;