import express from "express";
import multer from "multer";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Cấu hình AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Kiểm tra biến môi trường
if (!process.env.AWS_S3_BUCKET_NAME) {
  console.error("Lỗi: AWS_S3_BUCKET_NAME không được cấu hình trong .env");
  process.exit(1);
}

// Cấu hình Multer để lưu file tạm thời
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "video/mp4",
      "video/avi",
      "video/x-matroska",
      "video/webm",
      "video/quicktime",
    ];
    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".mp3",
      ".wav",
      ".ogg",
      ".webm",
      ".mp4",
      ".avi",
      ".mkv",
      ".mov",
    ];
    const fileExtension = `.${file.originalname.split(".").pop().toLowerCase()}`;
    console.log(`Kiểm tra file: MIME=${file.mimetype}, Extension=${fileExtension}`);

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      console.error(`File không được hỗ trợ: MIME=${file.mimetype}, Extension=${fileExtension}`);
      cb(new Error("Chỉ hỗ trợ file JPG, PNG, GIF, MP3, WAV, OGG, MP4, AVI, MKV, WEBM, MOV"), false);
    }
  },
});

// Middleware xử lý lỗi Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Lỗi Multer:", err.message);
    return res.status(400).json({ message: `Lỗi Multer: ${err.message}` });
  } else if (err) {
    console.error("Lỗi file filter:", err.message);
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Endpoint upload file
router.post("/", upload.single("file"), handleMulterError, async (req, res) => {
  try {
    console.log("Nhận yêu cầu upload:", {
      file: req.file ? req.file.originalname : "Không có file",
      mimetype: req.file ? req.file.mimetype : "N/A",
      size: req.file ? req.file.size : "N/A",
    });

    const file = req.file;
    if (!file) {
      console.error("Không có file được gửi");
      return res.status(400).json({ message: "Không có file được gửi" });
    }

    const fileName = `uploads/${uuidv4()}-${file.originalname}`;
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    console.log("Cấu hình upload S3:", {
      Bucket: params.Bucket,
      Key: params.Key,
      ContentType: params.ContentType,
    });

    // Kiểm tra bucket tồn tại
    try {
      await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET_NAME }).promise();
      console.log("Bucket tồn tại:", process.env.AWS_S3_BUCKET_NAME);
    } catch (error) {
      console.error("Lỗi kiểm tra bucket:", {
        message: error.message,
        code: error.code,
      });
      return res.status(500).json({ message: `Bucket không tồn tại hoặc không truy cập được: ${error.message}` });
    }

    // Upload file lên S3
    const result = await s3.upload(params).promise();
    console.log("Upload S3 thành công:", result.Location);

    res.json({ fileUrl: result.Location });
  } catch (error) {
    console.error("Lỗi upload file:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    res.status(500).json({ message: `Lỗi khi upload file: ${error.message}` });
  }
});

export default router;