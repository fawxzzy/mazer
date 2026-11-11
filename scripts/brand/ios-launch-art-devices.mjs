// Portrait iPhone launch-screen sizes for apple-touch-startup-image (MAZER-PWA-002).
// width/height are CSS points, ratio is the device pixel ratio; the PNG is width*ratio x height*ratio.
export const IOS_LAUNCH_ART_DEVICES = Object.freeze([
  { id: 'iphone-16-pro-max', width: 440, height: 956, ratio: 3 },
  { id: 'iphone-16-pro', width: 402, height: 874, ratio: 3 },
  { id: 'iphone-15-pro-max', width: 430, height: 932, ratio: 3 },
  { id: 'iphone-15-pro', width: 393, height: 852, ratio: 3 },
  { id: 'iphone-13-pro-max', width: 428, height: 926, ratio: 3 },
  { id: 'iphone-13', width: 390, height: 844, ratio: 3 },
  { id: 'iphone-x', width: 375, height: 812, ratio: 3 },
  { id: 'iphone-xr', width: 414, height: 896, ratio: 2 },
  { id: 'iphone-se', width: 375, height: 667, ratio: 2 }
]);

export const IOS_LAUNCH_ART_DIR = 'public/splash';
export const IOS_LAUNCH_ART_CACHE_VERSION = 'mazer-launch-v1';
export const launchArtFileName = (device) => `ios-${device.id}.png`;
export const launchArtPixels = (device) => ({ width: device.width * device.ratio, height: device.height * device.ratio });
export const launchArtMedia = (device) => (
  `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: portrait)`
);
export const launchArtLinkTag = (device) => (
  `<link rel="apple-touch-startup-image" href="/splash/${launchArtFileName(device)}?v=${IOS_LAUNCH_ART_CACHE_VERSION}" media="${launchArtMedia(device)}" />`
);
