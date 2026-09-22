import assets from "./pageAudioAssets.json" with { type: "json" };

export type PageAudioTopic = "need" | "opportunity" | "impact";
export interface PageAudioConfiguration {
  readonly src: string;
  readonly title: string;
  readonly credit: string;
}

export function pageAudio(topic: PageAudioTopic, assetBase = "/"): PageAudioConfiguration {
  const track = assets.tracks[topic];
  if (!track || track.path !== `audio/${topic}.mp3`) throw new Error("The approved page-audio mapping is invalid.");
  if (!/^(?:\.\/|\/(?:[A-Za-z0-9_-]+\/)*)$/.test(assetBase)) {
    throw new Error("The public audio base must be a local directory, not a navigation or external URL.");
  }
  return { src: `${assetBase}${track.path}`, title: track.title, credit: track.attribution };
}
