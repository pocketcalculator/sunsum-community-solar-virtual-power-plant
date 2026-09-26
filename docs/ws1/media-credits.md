# Third-party media

**The MIT license covers project code, not the supplied music recordings.**
Recording and composition rights remain with their respective owners. The user
has attested clearance to publish these exact excerpts on the public website,
in this repository and in its release bundles. This is an attestation, not an
independent legal certification or permission to reuse unrelated recordings.

The portable [terms and attributions](audio-credits.txt) are copied byte-for-byte
into **both ZIP roots as `AUDIO-CREDITS.txt`** and retained in the operator handoff.
The app packager maps this one public-safe document into its archive; Vite emits
the same source file into static output before build stamping. A missing,
changed or stale notice fails packaging. Do not create a second credit manifest
or rely on the static code-only `LICENSE.txt` to describe recording rights.

| Page | Application/source file | Static archive file |
| --- | --- | --- |
| Need | `public/audio/need.mp3` | `audio/need.mp3` |
| Opportunity | `public/audio/opportunity.mp3` | `audio/opportunity.mp3` |
| Impact | `public/audio/impact.mp3` | `audio/impact.mp3` |

The [public manifest](../../src/features/participation/content/pageAudioAssets.json)
is the canonical topic mapping and credit record. Each entry has a title,
attribution, MIME type, measured bytes/SHA-256, duration in seconds, sample rate
in Hz and channel count. No mailbox, message/attachment IDs, original attachment
metadata, private paths or permission packet belongs here or in a bundle.

## Replace an approved clip

1. Obtain publication approval for the exact replacement and retain that
   provenance privately. Inspect embedded metadata privately too; do not copy
   private tags into the public manifest. If a tag needs removal, obtain approval
   for that transformation rather than silently changing approved bytes.
2. Using an existing local media decoder/probe, confirm MP3 decoding, finite
   nonzero duration, sample rate and mono/stereo channels. Listen to the actual
   clip. A filename or transport-envelope size is not evidence of its content.
3. Put the approved bytes at the same one of the three named source paths.
   Measure the actual file length and SHA-256, then update that topic's nine
   fields in `pageAudioAssets.json`. Keep `schemaVersion: 1`, exactly the three
   topics, `path: audio/<topic>.mp3` and `mime: audio/mpeg`. Never fabricate probe
   measurements, copy another clip's digest or add private provenance fields.
   Update `audio-credits.txt` to repeat the manifest's exact public title and
   attribution while retaining its third-party/MIT distinction. The manifest
   remains authoritative; the notice is a portable human-readable copy of credits.
4. Review the bytes, public credits and manifest together. Exercise playback,
   pause, independent mute, ending/errors and navigation on both Next and the
   nested-prefix static demo. Only a deliberate Play may start a clip.
5. Commit the reviewed source through the normal owner process, rebuild the
   static demo from that clean revision and create a **new** release directory.
   The network-free packagers require all three pre-staged clips and reject
   missing/hash-mismatched media. Do not rewrite an old release manifest.

Local measurements for one already approved, staged file:

```powershell
$clip = Get-Item -LiteralPath '.\public\audio\need.mp3'
$clip.Length
(Get-FileHash -LiteralPath $clip.FullName -Algorithm SHA256).Hash
```

Run these for the actual replacement; use an installed decoder for the other
properties. No packager acquires audio or certifies copyright, audibility or
decodability. It binds the exact bytes to the previously reviewed/probed public
manifest. The application and static ZIPs each retain the 64 MiB compressed and
uncompressed total, 32 MiB per-entry and 10,000-entry limits. Do not omit clips,
transcode implicitly or increase caps to make a release pass.
