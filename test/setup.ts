/**
 * Chạy trước mọi file test (`--file test/setup.ts`). Unit test không cần DB thật, nhưng
 * `env.config.ts` bắt buộc `POSTGRES_URI` lúc import — đặt giá trị giả nếu chưa có.
 */
process.env.POSTGRES_URI ??= "postgres://test:test@localhost:5432/test";
