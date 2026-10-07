import type { RequestHandler } from "express";

let apiRequests = 0;
let responseBytes = 0;
let responsesWithLength = 0;
let paginatedResponses = 0;

export const trackApiEfficiency: RequestHandler = (request, response, next) => {
  response.once("finish", () => {
    apiRequests += 1;
    if (request.query.page !== undefined || request.query.limit !== undefined) paginatedResponses += 1;
    const length = Number(response.getHeader("content-length"));
    if (Number.isFinite(length) && length >= 0) {
      responseBytes += length;
      responsesWithLength += 1;
    }
  });
  next();
};

export function getApiEfficiencyMetrics() {
  return {
    measuredSince: "API process start",
    apiRequests,
    paginatedQueryResponses: paginatedResponses,
    responsesWithMeasuredContentLength: responsesWithLength,
    responseBytes,
    averageResponseBytes: responsesWithLength ? Math.round(responseBytes / responsesWithLength) : null,
  };
}
