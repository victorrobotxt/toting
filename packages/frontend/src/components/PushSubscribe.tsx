import { BellIcon } from '@heroicons/react/24/outline';

export default function PushSubscribe() {
  const handleSubscribe = async () => {
    try {
      if ((window as any).pushSDK) {
        await (window as any).pushSDK.optIn();
      } else if ((window as any).ethereum) {
        alert('Please install the Push Protocol browser extension to receive notifications.');
      }
    } catch (err) {
      console.error('Push subscribe failed', err);
    }
  };

  return (
    <button className="btn btn-secondary" onClick={handleSubscribe}>
      <BellIcon className="w-5 h-5 mr-2" /> Subscribe to Notifications
    </button>
  );
}
