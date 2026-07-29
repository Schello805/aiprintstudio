import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  // electron-builder signiert offizielle Releases bereits mit der über
  // CSC_LINK bereitgestellten Developer-ID. Diese Signatur darf hier niemals
  // durch eine Ad-hoc-Signatur ("-") überschrieben werden.
  if (!process.env.CSC_LINK && !process.env.CSC_NAME) {
    console.warn("Kein Developer-ID-Zertifikat gefunden – lokaler Testbuild wird ad hoc signiert.");
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  }

  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { stdio: "inherit" });
}
