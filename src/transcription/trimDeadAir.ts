import { execa } from "execa";

export type TrimDeadAirOptions = {
  input: string;
  output: string;

  /**
   * Silence must be at least this long before it gets shortened.
   * Default: 1 second.
   */
  minSilenceSeconds?: number;

  /**
   * Maximum silence to leave behind after trimming.
   * Default: 1 second.
   */
  keepSilenceSeconds?: number;

  /**
   * Volume threshold below which audio counts as silence.
   * More negative = less aggressive.
   * Less negative = more aggressive.
   *
   * Good starting values:
   * - -35dB: aggressive
   * - -40dB: normal
   * - -45dB: safer for quiet speech
   * - -50dB: conservative
   */
  thresholdDb?: number;

  /**
   * AAC output bitrate for m4a.
   */
  bitrate?: string;

  /**
   * Path to ffmpeg binary.
   */
  ffmpegPath?: string;
};

export async function trimDeadAir({
  input,
  output,
  minSilenceSeconds = 1,
  keepSilenceSeconds = 1,
  thresholdDb = -45,
  bitrate = "128k",
  ffmpegPath = "ffmpeg",
}: TrimDeadAirOptions): Promise<void> {
  if (keepSilenceSeconds > minSilenceSeconds) {
    throw new Error(
      `keepSilenceSeconds must be <= minSilenceSeconds. Got keep=${keepSilenceSeconds}, min=${minSilenceSeconds}.`,
    );
  }

  const filter = [
    "silenceremove=stop_periods=-1",
    `stop_duration=${minSilenceSeconds}`,
    `stop_threshold=${thresholdDb}dB`,
    `stop_silence=${keepSilenceSeconds}`,
    "detection=rms",
    "window=0.05",
  ].join(":");

  await execa(
    ffmpegPath,
    ["-y", "-i", input, "-af", filter, "-c:a", "aac", "-b:a", bitrate, output],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );
}
