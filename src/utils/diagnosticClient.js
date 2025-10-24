import axios from "axios";

const diagnosticClient = axios.create({
  baseURL: process.env.DIAGNOSTIC_SERVICE_URL || "http://med-core-diagnostic-service:3000/api/v1",
  timeout: 10000,
});

export default diagnosticClient;
