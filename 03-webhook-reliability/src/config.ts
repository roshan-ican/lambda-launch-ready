// One place for settings every file shares.
// On real AWS this would be me-central-1 (UAE). LocalStack Function URLs
// do not route me-* regions, so locally we use eu-central-1 (just a label here).
export const REGION = "eu-central-1";

// Used only by the local demo scripts (they talk to LocalStack from your Mac).
// Lambdas don't use this: inside LocalStack they already get the right endpoint.
export const LOCAL = {
  region: REGION,
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};
