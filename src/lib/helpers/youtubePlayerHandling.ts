import { Innertube, YT, ApiResponse } from "youtubei.js";
import { generateRandomString } from "youtubei.js/Utils";
import { compress, decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";
const { youtubePlayerReq } = await import(Deno.env.get("YT_PLAYER_REQ_LOCATION") || "./youtubePlayerReq.ts");
import { Store } from "@willsoto/node-konfig-core";

const kv = await Deno.openKv();

export const youtubePlayerParsing = async (
    innertubeClient: Innertube,
    videoId: string,
    konfigStore: Store,
): Promise<object> => {
    const cacheEnabled = konfigStore.get("cache.enabled");

    const videoCached = (await kv.get(["video_cache", videoId]))
        .value as Uint8Array;

    if (videoCached != null && cacheEnabled == true) {
        return JSON.parse(new TextDecoder().decode(decompress(videoCached)));
    } else {
        const youtubePlayerResponse = await youtubePlayerReq(
            innertubeClient,
            videoId,
            konfigStore
        );
        const videoData = youtubePlayerResponse.data;

        const video = new YT.VideoInfo(
            [youtubePlayerResponse],
            innertubeClient.actions,
            generateRandomString(16),
        );

        const streamingData = video.streaming_data;

        // Modify the original YouTube response to include deciphered URLs
        if (streamingData && videoData && videoData.streamingData) {
            const ecatcherServiceTracking = videoData.responseContext?.serviceTrackingParams.find(o => o.service === 'ECATCHER');
            const clientNameUsed = ecatcherServiceTracking?.params?.find(o => o.key === 'client.name');
            // no need to decipher on IOS nor ANDROID
            if (!clientNameUsed?.value.includes("IOS") && !clientNameUsed?.value.includes("ANDROID")) {
                for (const [index, format] of streamingData.formats.entries()) {
                    videoData.streamingData.formats[index].url = format.decipher(
                        innertubeClient.session.player,
                    );
                    if (
                        videoData.streamingData.formats[index].signatureCipher !==
                            undefined
                    ) {
                        delete videoData.streamingData.formats[index]
                            .signatureCipher;
                    }
                }
                for (
                    const [index, adaptive_format] of streamingData.adaptive_formats
                        .entries()
                ) {
                    videoData.streamingData.adaptiveFormats[index].url =
                        adaptive_format
                            .decipher(
                                innertubeClient.session.player,
                            );
                    if (
                        videoData.streamingData.adaptiveFormats[index]
                            .signatureCipher !==
                            undefined
                    ) {
                        delete videoData.streamingData.adaptiveFormats[index]
                            .signatureCipher;
                    }
                }
            }
        }

        const videoOnlyNecessaryInfo = ((
            {
                captions,
                playabilityStatus,
                storyboards,
                streamingData,
                videoDetails,
                microformat,
            },
        ) => ({
            captions,
            playabilityStatus,
            storyboards,
            streamingData,
            videoDetails,
            microformat,
            invidiousCompanion: {
                "baseUrl": Deno.env.get("SERVER_BASE_URL") || konfigStore.get("server.base_url") as string,
            },
        }))(videoData);

        if (cacheEnabled == true && videoData.playabilityStatus?.status == "OK") {
            (async () => {
                await kv.set(
                    ["video_cache", videoId],
                    compress(
                        new TextEncoder().encode(
                            JSON.stringify(videoOnlyNecessaryInfo),
                        ),
                    ),
                    {
                        expireIn: 1000 * 60 * 60,
                    },
                );
            })();
        }

        return videoOnlyNecessaryInfo;
    }
};

export const youtubeVideoInfo = (
    innertubeClient: Innertube,
    youtubePlayerResponseJson: object
): YT.VideoInfo => {
    const playerResponse = {
        success: true,
        status_code: 200,
        data: youtubePlayerResponseJson,
    } as ApiResponse;
    return new YT.VideoInfo(
        [playerResponse],
        innertubeClient.actions,
        "",
    );
}
