/* eslint-disable no-console */
import {
  rehostUrl,
  isStorageConfigured,
  getStorageName,
  deriveVideoPath,
} from "../lib/storage";

async function main() {
  console.log("[1] driver in current env:", getStorageName(), "configured?", isStorageConfigured());

  // 用一个真实 fal flux 缩略图 URL（之前 E2E 跑出来的）
  const sample = "https://v3b.fal.media/files/b/0a9bb70c/wrDDmTcAt9mkcj_dUNeXY.jpg";
  const path = deriveVideoPath("smoke", "test-rehost.jpg");
  const result = await rehostUrl({
    sourceUrl: sample,
    pathname: path,
    contentType: "image/jpeg",
  });
  console.log("[2] rehost result:", result ?? "(null — driver not configured, expected fall-through)");

  if (result) {
    console.log("[3] verifying upload is reachable…");
    const head = await fetch(result, { method: "GET" });
    console.log("    HEAD status:", head.status, head.headers.get("content-type"));
  } else {
    console.log("[3] skipped (no driver). 填好 TENCENT_COS_BUCKET/REGION 后再跑即可看到真实 URL");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
