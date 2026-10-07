/**
 * Local notifications — the other half of the daily loop. After a clock-in we
 * schedule tomorrow's reminder for the moment the next day opens on-chain, so
 * the streak nudge arrives exactly when it can be acted on.
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

export async function scheduleStreakReminder(at: Date, streak: number, nextReward: string) {
  try {
    if (!(await setup())) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Day ${streak + 1} is open`,
        body: `Clock in to keep your ${streak}-day streak and collect ${nextReward}.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'streak' },
    });
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
