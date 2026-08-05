export const CONFIG = {
  bridgeUrl: "http://127.0.0.1:38473",
  sampleSeconds: 60,
  // Where the "Request access" link on the blocked page sends the employee to file a
  // request. The extension never calls this URL itself -- it has no FieldFlow
  // credentials and never should.
  fieldflowAppUrl: "https://fieldflow-henna.vercel.app"
};
