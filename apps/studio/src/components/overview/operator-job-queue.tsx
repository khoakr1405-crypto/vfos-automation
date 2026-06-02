'use client';

import { useState } from 'react';
import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon, UtilIcon } from '../icons';
import { Button } from '../ui';

// Custom interface for Operator Job mapping
interface OperationalJob {
  id: string;
  title: string;
  lane: string;
  product: string;
  price: string;
  duration: string;
  suggestedChannel: string;
  platform: 'tiktok' | 'facebook' | 'youtube';
  reason: string;
  status: 'PENDING_REVIEW' | 'FAILED' | 'QA_PASS' | 'APPROVED' | 'REJECTED';
  pipeline: {
    source: 'pass' | 'fail' | 'warn';
    script: 'pass' | 'fail' | 'warn';
    voice: 'pass' | 'fail' | 'warn';
    bgm: 'pass' | 'fail' | 'warn';
    render: 'pass' | 'fail' | 'warn';
    qa: 'pass' | 'fail' | 'warn';
    affiliateLink: 'pass' | 'fail';
  };
  errorLog?: {
    stage: string;
    error: string;
    expected: string;
    actual: string;
    suggestedFix: string;
  };
}

const INITIAL_JOBS: OperationalJob[] = [
  {
    id: 'JOB-2401',
    title: 'Review Máy rửa xe Zukul — Demo áp lực phun',
    lane: 'Review sản phẩm',
    product: 'Máy rửa xe mini Zukul',
    price: '₫699.000',
    duration: '00:45',
    suggestedChannel: 'TikTok Review 01',
    platform: 'tiktok',
    reason: 'Có CTR tốt nhất (4.81%) trong cụm Review sản phẩm 7 ngày qua.',
    status: 'PENDING_REVIEW',
    pipeline: {
      source: 'pass',
      script: 'pass',
      voice: 'pass',
      bgm: 'pass',
      render: 'pass',
      qa: 'pass',
      affiliateLink: 'pass',
    },
  },
  {
    id: 'JOB-2402',
    title: 'Review Cần câu Carbon 2m1 — Test độ tải tĩnh',
    lane: 'Review sản phẩm',
    product: 'Cần câu Carbon 2m1',
    price: '₫159.000',
    duration: '00:30',
    suggestedChannel: 'YouTube Review Shorts',
    platform: 'youtube',
    reason: 'Định dạng video dọc 9:16 thích hợp phát Shorts để kéo traffic SEO.',
    status: 'FAILED',
    pipeline: {
      source: 'pass',
      script: 'pass',
      voice: 'pass',
      bgm: 'fail',
      render: 'pass',
      qa: 'fail',
      affiliateLink: 'pass',
    },
    errorLog: {
      stage: 'bgm',
      error: 'BGM audio overlay loudness too high',
      expected: 'BGM volume at -24 LUFS (background mix layer)',
      actual: 'BGM volume detected at -10 LUFS (overlays voiceover voice)',
      suggestedFix: 'Re-run mix voice & BGM scripts with attenuation --bgm-attenuation=-15dB',
    },
  },
  {
    id: 'JOB-2403',
    title: 'Review Máy xay sinh tố mini — Demo xay đá mịn',
    lane: 'Review sản phẩm',
    product: 'Máy xay sinh tố cầm tay',
    price: '₫249.000',
    duration: '00:35',
    suggestedChannel: 'Facebook Reels Reviewer',
    platform: 'facebook',
    reason: 'Mạng FB Reels ưu ái phân phối các ngách hàng gia dụng thông minh.',
    status: 'PENDING_REVIEW',
    pipeline: {
      source: 'pass',
      script: 'pass',
      voice: 'pass',
      bgm: 'pass',
      render: 'fail',
      qa: 'fail',
      affiliateLink: 'pass',
    },
    errorLog: {
      stage: 'render',
      error: 'FFmpeg audio mapping failed',
      expected: 'voiceover.mp3 mapped as input 1',
      actual: 'source_video.mp4 audio track was mistakenly selected',
      suggestedFix: 'Re-run render with explicit audio mapping -map 0:v:0 -map 1:a:0',
    },
  },
];

export function OperatorJobQueue() {
  const [jobs, setJobs] = useState<OperationalJob[]>(INITIAL_JOBS);

  const handleAction = (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
  };

  const getStatusBadge = (status: OperationalJob['status']) => {
    switch (status) {
      case 'APPROVED':
        return <Badge accent="green">Đã Duyệt (Chờ xếp lịch đăng)</Badge>;
      case 'REJECTED':
        return <Badge accent="rose">Đã Từ Chối</Badge>;
      case 'FAILED':
        return <Badge accent="rose">Lỗi Kỹ Thuật</Badge>;
      case 'QA_PASS':
        return <Badge accent="green">QA Pass</Badge>;
      default:
        return <Badge accent="amber">Chờ Operator Duyệt</Badge>;
    }
  };

  const getPipeIcon = (state: 'pass' | 'fail' | 'warn') => {
    if (state === 'pass') {
      return (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-green/10 text-accent-green"
          title="Đạt"
        >
          <UtilIcon name="check" width={10} height={10} />
        </span>
      );
    }
    if (state === 'fail') {
      return (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-rose/10 text-accent-rose"
          title="Lỗi"
        >
          <UtilIcon name="x" width={10} height={10} />
        </span>
      );
    }
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-amber/10 text-accent-amber"
        title="Cảnh báo"
      >
        <UtilIcon name="bell" width={10} height={10} />
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />
            Hành lang kiểm soát video jobs (Active Lane: Review sản phẩm)
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Duyệt preview, kiểm tra pipelines và xử lý các lỗi render/audio trực tiếp trước khi xuất
            bản.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge accent="blue">Ngách: Review</Badge>
          <Badge accent="green">Publish: Auto</Badge>
        </div>
      </div>

      <div className="grid gap-5">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className={`transition border ${
              job.status === 'APPROVED'
                ? 'border-accent-green/30 bg-accent-green/5'
                : job.status === 'REJECTED'
                  ? 'border-accent-rose/20 bg-accent-rose/5 opacity-70'
                  : job.status === 'FAILED'
                    ? 'border-accent-rose/30 bg-card/90'
                    : 'border-hairline hover:border-neutral-700 bg-card/85'
            }`}
          >
            <CardBody className="p-5 flex flex-col md:flex-row gap-5">
              {/* Left Column: 9:16 Video Player Simulation Area */}
              <div className="w-full md:w-[150px] shrink-0 flex flex-col items-center">
                <div className="relative aspect-[9/16] w-[130px] rounded-xl overflow-hidden bg-neutral-950 border border-hairline/85 shadow-lg group">
                  {/* Visual simulated gradients representing video */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-accent-violet/30 via-neutral-900/40 to-accent-blue/30" />
                  <div className="absolute inset-0 bg-neutral-950/20" />

                  {/* Duration Badge */}
                  <div className="absolute top-2 right-2 bg-neutral-950/80 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-neutral-300">
                    {job.duration}
                  </div>

                  {/* Platform Indicator */}
                  <div className="absolute top-2 left-2 bg-neutral-950/70 p-1 rounded">
                    {job.platform === 'tiktok' && (
                      <Icon name="publish" width={10} height={10} className="text-accent-cyan" />
                    )}
                    {job.platform === 'facebook' && (
                      <Icon name="channels" width={10} height={10} className="text-accent-blue" />
                    )}
                    {job.platform === 'youtube' && (
                      <Icon name="analytics" width={10} height={10} className="text-accent-rose" />
                    )}
                  </div>

                  {/* Center Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-950/80 border border-neutral-600/50 text-neutral-200 transition group-hover:scale-110 group-hover:bg-neutral-900 shadow-md">
                      <UtilIcon
                        name="play"
                        width={14}
                        height={14}
                        className="text-neutral-100 fill-neutral-100 translate-x-[1px]"
                      />
                    </span>
                  </div>

                  {/* Sound Wave Visualizer Mock */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between h-4 px-2">
                    <span className="w-[2px] bg-accent-blue rounded-full h-1/2 animate-pulse" />
                    <span className="w-[2px] bg-accent-blue rounded-full h-full animate-pulse delay-75" />
                    <span className="w-[2px] bg-accent-blue rounded-full h-2/3 animate-pulse delay-100" />
                    <span className="w-[2px] bg-accent-blue rounded-full h-1/3 animate-pulse delay-150" />
                    <span className="w-[2px] bg-accent-blue rounded-full h-4/5 animate-pulse delay-200" />
                  </div>
                </div>
                <span className="text-[10px] text-neutral-500 font-medium mt-2">
                  Preview (Dọc 9:16)
                </span>
              </div>

              {/* Right Column: Metadata and Operations */}
              <div className="flex-1 space-y-4">
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-accent-blue tracking-wide">
                        {job.id}
                      </span>
                      <span className="text-neutral-600 font-medium text-xs">·</span>
                      <span className="text-xs text-neutral-400 font-semibold">{job.lane}</span>
                      <span className="text-neutral-600 font-medium text-xs">·</span>
                      <span className="text-xs font-bold text-accent-amber bg-accent-amber/10 px-2 py-0.5 rounded">
                        {job.price}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-neutral-100 mt-1">{job.title}</h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Sản phẩm:{' '}
                      <span className="font-semibold text-neutral-200">{job.product}</span>
                    </p>
                  </div>
                  <div>{getStatusBadge(job.status)}</div>
                </div>

                {/* Pipeline Steps Dashboard */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 bg-raised/30 border border-hairline/50 p-2.5 rounded-xl text-center">
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                      Source Video
                    </p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.source)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Script</p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.script)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Voice AI</p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.voice)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">BGM Mix</p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.bgm)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Render</p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.render)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Tech QA</p>
                    <div className="flex justify-center">{getPipeIcon(job.pipeline.qa)}</div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider">
                      Affiliate
                    </p>
                    <div className="flex justify-center">
                      {job.pipeline.affiliateLink === 'pass' ? (
                        <span
                          className="inline-flex items-center text-[10px] text-accent-green font-bold gap-0.5"
                          title="Shopee Owner Valid: an_17376660568"
                        >
                          <UtilIcon name="check" width={10} height={10} /> Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] text-accent-rose font-bold gap-0.5">
                          <UtilIcon name="x" width={10} height={10} /> Invalid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Channel Suggestion details */}
                <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/5 p-3 flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center shrink-0 mt-0.5">
                    <UtilIcon name="sparkle" width={12} height={12} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-200">
                      Gợi ý phát sóng:{' '}
                      <span className="text-accent-blue">{job.suggestedChannel}</span> (Publish
                      Target: {job.platform.toUpperCase()})
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      {job.reason} (Khi phê duyệt, job sẽ chuyển tiếp vào Hàng đợi đăng / Publish
                      Queue để phân phối tới kênh).
                    </p>
                  </div>
                </div>

                {/* Technical CLI-style Error Logs (if failed or warned) */}
                {job.errorLog && (
                  <div className="rounded-xl border border-accent-rose/25 bg-neutral-950 p-3.5 font-mono text-[11px] text-accent-rose space-y-1.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-accent-rose/10 pb-1.5 mb-1.5">
                      <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-rose animate-ping" />
                        TECHNICAL ERROR REPORT LOG
                      </span>
                      <span className="text-[9px] text-neutral-600 bg-accent-rose/5 px-2 py-0.5 rounded border border-accent-rose/10">
                        STAGE: {job.errorLog.stage.toUpperCase()}
                      </span>
                    </div>
                    <p>
                      <span className="text-neutral-500">Error:</span> {job.errorLog.error}
                    </p>
                    <p>
                      <span className="text-neutral-500">Expected:</span> {job.errorLog.expected}
                    </p>
                    <p>
                      <span className="text-neutral-500">Actual:</span> {job.errorLog.actual}
                    </p>
                    <p className="text-accent-green font-semibold pt-1 border-t border-hairline/10 mt-1.5">
                      <span className="text-neutral-500 font-normal">Suggested Fix:</span>{' '}
                      {job.errorLog.suggestedFix}
                    </p>
                  </div>
                )}

                {/* Operator Actions row */}
                {job.status === 'PENDING_REVIEW' && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="success"
                      className="hover:bg-accent-green/90 text-white font-bold px-4 py-1.5 flex items-center gap-1"
                      onClick={() => handleAction(job.id, 'APPROVED')}
                    >
                      <UtilIcon name="check" width={12} height={12} /> Phê duyệt
                    </Button>
                    <Button
                      variant="ghost"
                      className="border border-hairline hover:bg-raised/40 hover:text-accent-rose text-neutral-300 font-bold px-4 py-1.5 flex items-center gap-1"
                      onClick={() => handleAction(job.id, 'REJECTED')}
                    >
                      <UtilIcon name="x" width={12} height={12} /> Từ Chối
                    </Button>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
