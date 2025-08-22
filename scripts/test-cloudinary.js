require("dotenv").config();
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

(async () => {
  try {
    const ping = await cloudinary.api.ping();
    console.log("Ping:", ping.status); // should be "ok"

    // Optional: upload + cleanup a tiny raw file to fully test
    const folder = process.env.CLOUDINARY_FOLDER || "file_uploader";
    const content = Buffer.from("hello cloudinary").toString("base64");
    const result = await cloudinary.uploader.upload(
      `data:text/plain;base64,${content}`,
      { resource_type: "raw", folder, public_id: `test_${Date.now()}` }
    );
    console.log("Uploaded:", result.secure_url);

    await cloudinary.uploader.destroy(result.public_id, { resource_type: "raw" });
    console.log("Cleaned up test upload.");
  } catch (e) {
    console.error("Cloudinary check failed:", e.message);
  }
})();
