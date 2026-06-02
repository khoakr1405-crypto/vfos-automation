import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const WEEK_DATA = [
  { day: 'T2', date: '26/05', jobs: 3, videos: 2, today: false },
  { day: 'T3', date: '27/05', jobs: 5, videos: 4, today: true }, // Highlight T3 (Tuesday)
  { day: 'T4', date: '28/05', jobs: 2, videos: 1, today: false },
  { day: 'T5', date: '29/05', jobs: 4, videos: 3, today: false },
  { day: 'T6', date: '30/05', jobs: 6, videos: 5, today: false },
  { day: 'T7', date: '31/05', jobs: 3, videos: 2, today: false },
  { day: 'CN', date: '01/06', jobs: 1, videos: 1, today: false },
];

export function WeeklyActivity() {
  return (
    <Card>
      <CardHeader
        title="Lịch hoạt động tuần này"
        subtitle="Kế hoạch và tiến độ sản xuất nội dung"
        no={11}
        accentClass="text-accent-amber"
      />
      <CardBody className="grid grid-cols-7 gap-2 sm:gap-3">
        {WEEK_DATA.map((item) => (
          <div
            key={item.day}
            className={`flex flex-col items-center justify-between rounded-xl border p-3 transition text-center ${
              item.today
                ? 'bg-gradient-to-b from-accent-violet/10 to-accent-blue/10 border-accent-blue shadow-lg ring-1 ring-accent-blue/20'
                : 'bg-raised/30 border-hairline hover:bg-raised/50 hover:border-neutral-700'
            }`}
          >
            <div className="space-y-0.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${item.today ? 'text-accent-blue' : 'text-neutral-500'}`}
              >
                {item.day}
              </span>
              <p
                className={`text-xs font-semibold ${item.today ? 'text-neutral-50' : 'text-neutral-400'}`}
              >
                {item.date}
              </p>
            </div>

            <div className="my-3 space-y-1">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-neutral-500 font-medium">Job</span>
                <span
                  className={`text-sm font-bold ${item.today ? 'text-accent-violet' : 'text-neutral-200'}`}
                >
                  {item.jobs}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-neutral-500 font-medium">Video</span>
                <span
                  className={`text-sm font-bold ${item.today ? 'text-accent-green' : 'text-neutral-200'}`}
                >
                  {item.videos}
                </span>
              </div>
            </div>

            {item.today ? (
              <span className="rounded-full bg-accent-blue/15 px-2 py-0.5 text-[9px] font-bold text-accent-blue">
                Hôm nay
              </span>
            ) : (
              <span className="h-4 w-4" />
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
