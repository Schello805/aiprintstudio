import { parentPort } from "node:worker_threads";
import { createRelief, type ReliefOptions } from "./relief.js";

type ReliefWorkerRequest = {
  imagePath: string;
  outputDirectory: string;
  options: Partial<ReliefOptions>;
  depthMapPath?: string;
};

if (!parentPort) throw new Error("Relief-Worker wurde ohne Parent-Port gestartet.");

parentPort.once("message", async (request: ReliefWorkerRequest) => {
  try {
    const result = await createRelief(
      request.imagePath,
      request.outputDirectory,
      request.options,
      request.depthMapPath,
      (progress) => parentPort?.postMessage({ type: "progress", progress })
    );
    parentPort?.postMessage({ type: "result", result });
  } catch (error) {
    parentPort?.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unbekannter Fehler im Relief-Worker"
    });
  }
});
