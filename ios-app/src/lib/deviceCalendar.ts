import { Platform } from 'react-native';
import { getCalendars, getDefaultCalendarSync, requestCalendarPermissions, EntityTypes } from 'expo-calendar';
import { dateFromMeetup, type Meetup } from '@/lib/calendar';

export async function addMeetupToDeviceCalendar(meetup: Meetup): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Download the .ics file from the web app, or open Flarmo on iPhone to add it.');
  }
  const permission = await requestCalendarPermissions(true);
  if (!permission.granted) throw new Error('Calendar access is off — allow it in Settings');
  const startDate = dateFromMeetup(meetup.day, meetup.start);
  const endDate = dateFromMeetup(meetup.day, meetup.end);
  const details = {
    title: `Daily Restaurant Meetup — ${meetup.spot}`,
    startDate,
    endDate,
    location: meetup.spot,
    notes: meetup.ride ? `Ride: ${meetup.ride}` : 'Confirmed in Flarmalodebop',
  };
  try {
    const calendar = getDefaultCalendarSync();
    await calendar.createEvent(details);
    return;
  } catch {
    const calendars = await getCalendars(EntityTypes.EVENT);
    const calendar = calendars.find((item) => item.allowsModifications) ?? calendars[0];
    if (!calendar) throw new Error('No calendar is available on this iPhone');
    await calendar.createEvent(details);
  }
}
