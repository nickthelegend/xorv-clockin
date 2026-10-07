/**
 * Local notifications — the other half of the daily loop.
 *
 *  - "Day N is open": fires the moment the next on-chain day starts.
 *  - "Streak at risk": fires at 20:00 local on that day (or 2 h before the
 *    on-chain day closes, if that is earlier), so the evening nudge arrives
 *    while there is still time to act.
 *
 * Both are re-armed after every clock-in (cancel-all + schedule), so a
 * reminder never fires for a day the user already clocked in.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let configured = false;
async function setup(): Promise<boolean> {
  if (!configured) {
    configured = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('streak', {
        name: 'Clock-in streak',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync('jobs', {
        name: 'Job results',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

const at = (date: Date, title: string, body: string) =>
  Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'streak' },
  });

function eveningOf(fromMs: number, dayEndMs: number): Date | null {
  const d = new Date(fromMs);
  d.setHours(20, 0, 0, 0);
  if (d.getTime() < fromMs) d.setDate(d.getDate() + 1);
  const t = Math.min(d.getTime(), dayEndMs - 2 * 3600_000);
  return t > Date.now() + 60_000 ? new Date(t) : null;
}

/**
 * @param day     current on-chain day index (unix / dayLength)
 * @param skew    chain clock minus local clock, seconds
 * @param streak  the streak that is at stake (after today's clock-in, if done)
 */
export async function scheduleStreakReminders(o: {
  day: number;
  dayLength: number;
  skew: number;
  streak: number;
  clockedInToday: boolean;
  nextReward: string;
}) {
  try {
    if (!(await setup())) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    const toLocal = (chainSec: number) => (chainSec - o.skew) * 1000;
    const pendingDay = o.clockedInToday ? o.day + 1 : o.day; // the day whose clock-in is still open
    const start = toLocal(pendingDay * o.dayLength);
    const end = toLocal((pendingDay + 1) * o.dayLength);
    if (o.clockedInToday && start > Date.now()) {
      await at(new Date(start), `Day ${o.streak + 1} is open`, `Clock in to keep your ${o.streak}-day streak and collect ${o.nextReward}.`);
    }
    const evening = eveningOf(Math.max(start, Date.now()), end);
    if (evening && o.streak > 0) {
      const closes = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      await at(evening, 'Your streak is at risk', `Your ${o.streak}-day streak resets at ${closes}. One tap keeps it.`);
    }
  } catch {
    /* notifications are a nicety, never a blocker */
  }
}

export async function notifyNow(title: string, body: string) {
  try {
    if (!(await setup())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === 'android' ? { channelId: 'jobs' } : null,
    });
  } catch {
    /* ignore */
  }
}
