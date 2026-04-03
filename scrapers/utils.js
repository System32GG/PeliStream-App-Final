function isAdUrl(url) {
  if (!url) return true;
  const adKeywords = [
    'bannister', 'attire', 'adserver', 'ads.', '/ads/', 'popads',
    'popcash', 'adnxs', 'doubleclick', 'googlesyndication', 'ad.fly',
    'adfly', 'shorte.st', 'ouo.io', 'linkvertise', 'adf.ly', 'sh.st',
    'bc.vc', 'duclictly', 'redirect', 'tracker', 'clickadu',
    'adxxx', 'xxxads', 'exosrv', 'juicyads', 'trafficjunky',
    'propellerads', 'hilltopads', 'mgid', 'taboola', 'outbrain',
  ];
  const lower = url.toLowerCase();
  if (adKeywords.some(k => lower.includes(k))) return true;
  // Block URLs that are clearly not video hosts (random-looking domains with short paths like /?var=)
  if (/\?var=[a-z0-9]+$/i.test(url)) return true;
  return false;
}

function isVideoUrl(url) {
  if (!url) return false;
  const videoHosts = [
    'streamwish', 'filemoon', 'vidhide', 'voe', 'doodstream', 'dood',
    'netu', 'hqq', 'embed69', 'upstream', 'mixdrop', 'mp4upload',
    'uqload', 'waaw', 'peliscloud', 'streamsb', 'fembed', 'mycloud',
    'vidcloud', 'embedsito', 'swiftload', 'player', 'playersb',
    'hlscloud', 'cloudvideo',
  ];
  return videoHosts.some(host => url.toLowerCase().includes(host));
}

function extractServerName(url) {
  try {
    const hostname = new URL(url.startsWith('//') ? 'https:' + url : url).hostname;
    let name = hostname.replace('www.', '').replace('player.', '').split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Servidor';
  }
}

module.exports = {
  isAdUrl,
  isVideoUrl,
  extractServerName
};
