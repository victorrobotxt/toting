export const emit = (event: string, data: Record<string, any> = {}): void => {
  try {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event, data);
    } else {
      console.log('analytics event', event, data);
    }
  } catch (err) {
    console.warn('analytics failed', err);
  }
};
