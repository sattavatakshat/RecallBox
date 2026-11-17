import {Redirect} from 'expo-router';

/** Compatibility for existing deep links: durable originals now live in Library. */
export default function RecentlyCaptured() {
  return <Redirect href="/(account)"/>;
}
