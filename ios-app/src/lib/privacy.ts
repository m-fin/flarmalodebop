export const PRIVACY_UPDATED = 'November 27, 2026';

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Who we are',
    body: 'Flarmalodebop is a private messenger for exactly two people. Matthew Finley operates it. It is not a social network and it does not show ads. Questions: open an issue on github.com/m-fin/flarmalodebop.',
  },
  {
    title: 'What the app stores',
    body: 'An email and display name for each invited person, and the messages you choose to send (text, photos, voice notes, reactions, replies, and edits). It also stores a read pointer, a short “app is open” heartbeat, a push token if you turn notifications on, and the shared calendar you save together: work shifts, days off, favorite restaurants, and restaurant meetup proposals. Draft text stays on this device until you send it. The app does not ask for contacts, location, or an advertising identifier, and it does not use an analytics or advertising SDK.',
  },
  {
    title: 'Camera, photos, microphone, and calendar',
    body: 'The camera, photo library, and microphone are used only when you choose to send a picture or a voice note. Nothing is recorded in the background. Calendar access is used only when you tap to add a confirmed restaurant meetup. The app does not read the rest of your calendar.',
  },
  {
    title: 'Who can read a message',
    body: 'The two signed-in people can read the thread. Someone who is not signed in cannot. Messages are encrypted in transit (HTTPS) and stored by Supabase, which encrypts data at rest. They are not end-to-end encrypted. The person who operates the Supabase project can access the database.',
  },
  {
    title: 'How long it is kept',
    body: 'Messages stay until you unsend them or the database is deleted. Signing out removes the session from this device. Drafts stay on the device until you send, clear the composer, or delete the app.',
  },
  {
    title: 'Children',
    body: 'Flarmalodebop is not directed at children under 13, and you should not make an account for a child.',
  },
];
