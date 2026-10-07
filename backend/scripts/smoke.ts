import { prisma } from "../src/database.ts";

const baseUrl = `http://localhost:${process.env.PORT ?? 5000}/api`;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let ownerId: string | undefined;
let requesterId: string | undefined;
let secondRequesterId: string | undefined;
let itemId: string | undefined;
let directItemId: string | undefined;
let saleItemId: string | undefined;
let exchangeItemId: string | undefined;
let exchangeOfferItemId: string | undefined;
let exchangeOtherOfferItemId: string | undefined;
let exchangeRequestId: string | undefined;
let exchangeSecondRequestId: string | undefined;
let requestId: string | undefined;
let saleRequestId: string | undefined;
let reportId: string | undefined;
let campaignId: string | undefined;
let goalId: string | undefined;

async function call<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const data = await response.json().catch(() => ({})) as T;
  return { status: response.status, data };
}

async function uploadCall<T>(path: string, token: string, body: FormData): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
  return { status: response.status, data: await response.json().catch(() => ({})) as T };
}

function requireCheck(test: unknown, message: string) {
  if (!test) throw new Error(message);
}

function kolkataParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

try {
  const health = await call<{ success: boolean }>("/health");
  requireCheck(health.status === 200 && health.data.success, "Health endpoint failed.");

  const ownerResult = await call<{ token: string; user: { id: string } }>("/auth/register", {
    method: "POST", body: { name: "Smoke Test Owner", email: `reusehub-owner-${suffix}@example.test`, password: "SmokeTestPass123!" },
  });
  requireCheck(ownerResult.status === 201, "Owner registration failed.");
  const owner = ownerResult.data;
  ownerId = owner.user.id;

  const login = await call<{ token: string }>("/auth/login", {
    method: "POST", body: { email: `reusehub-owner-${suffix}@example.test`, password: "SmokeTestPass123!" },
  });
  requireCheck(login.status === 200 && Boolean(login.data.token), "Login failed.");
  requireCheck((await call("/auth/me", { token: owner.token })).status === 200, "Authenticated profile lookup failed.");
  const profileUpdate = await call<{ user: { name: string; password?: string } }>("/auth/me", {
    method: "PUT", token: owner.token, body: { name: "Smoke Test Owner Updated" },
  });
  requireCheck(profileUpdate.status === 200 && profileUpdate.data.user.name === "Smoke Test Owner Updated" && !profileUpdate.data.user.password, "Safe profile update failed.");
  requireCheck((await call("/admin/stats", { token: owner.token })).status === 403, "A member was not blocked from admin endpoints.");
  await prisma.user.update({ where: { id: ownerId }, data: { role: "ADMIN" } });
  const adminUsers = await call<{ users: Array<Record<string, unknown>> }>("/admin/users?limit=5", { token: owner.token });
  requireCheck(adminUsers.status === 200 && adminUsers.data.users.every((entry) => !("password" in entry)), "Admin access or safe user listing failed.");
  const greenIt = await call<{ measured: { api: { apiRequests: number }; itemLifecycle: Record<string, number> } }>("/admin/green-it", { token: owner.token });
  requireCheck(greenIt.status === 200 && greenIt.data.measured.api.apiRequests > 0 && typeof greenIt.data.measured.itemLifecycle.available === "number", "Green IT metrics endpoint failed.");
  await prisma.user.update({ where: { id: ownerId }, data: { role: "USER" } });

  const requesterResult = await call<{ token: string; user: { id: string } }>("/auth/register", {
    method: "POST", body: { name: "Smoke Test Requester", email: `reusehub-requester-${suffix}@example.test`, password: "SmokeTestPass123!" },
  });
  requireCheck(requesterResult.status === 201, "Requester registration failed.");
  const requester = requesterResult.data;
  requesterId = requester.user.id;
  const secondRequesterResult = await call<{ token: string; user: { id: string } }>("/auth/register", {
    method: "POST", body: { name: "Smoke Test Second Requester", email: `reusehub-requester-two-${suffix}@example.test`, password: "SmokeTestPass123!" },
  });
  requireCheck(secondRequesterResult.status === 201, "Second requester registration failed.");
  const secondRequester = secondRequesterResult.data;
  secondRequesterId = secondRequester.user.id;

  const categories = await call<{ categories: Array<{ id: string; name: string; slug: string }> }>("/categories");
  requireCheck(categories.status === 200 && categories.data.categories.length > 0, "Seeded categories could not be loaded.");
  const bookCategory = categories.data.categories.find((category) => category.slug === "books");
  requireCheck(Boolean(bookCategory), "Books category could not be loaded.");
  const exchangeTarget = await call<{ item: { id: string } }>("/items", { method: "POST", token: owner.token, body: { title: `Smoke Exchange Calculator ${suffix}`, description: "Temporary item-for-item exchange target.", condition: "GOOD", exchangeType: "EXCHANGE", categoryId: bookCategory!.id, exchangePreferredCategories: [bookCategory!.id] } });
  requireCheck(exchangeTarget.status === 201, "Exchange listing or preferred categories could not be saved.");
  exchangeItemId = exchangeTarget.data.item.id;
  const offerA = await call<{ item: { id: string } }>("/items", { method: "POST", token: requester.token, body: { title: `Smoke Exchange Offer A ${suffix}`, description: "Temporary offered book.", condition: "GOOD", exchangeType: "EXCHANGE", categoryId: bookCategory!.id } });
  requireCheck(offerA.status === 201, "Requester could not create an item to offer.");
  exchangeOfferItemId = offerA.data.item.id;
  const offerB = await call<{ item: { id: string } }>("/items", { method: "POST", token: secondRequester.token, body: { title: `Smoke Exchange Offer B ${suffix}`, description: "Temporary second offer.", condition: "GOOD", exchangeType: "EXCHANGE", categoryId: bookCategory!.id } });
  requireCheck(offerB.status === 201, "Second requester could not create an item to offer.");
  exchangeOtherOfferItemId = offerB.data.item.id;
  requireCheck((await call("/requests", { method: "POST", token: requester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOtherOfferItemId } })).status === 400, "The backend accepted an item owned by another requester as an offer.");
  requireCheck((await call("/requests", { method: "POST", token: owner.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOfferItemId } })).status === 400, "The backend allowed a self-exchange.");
  const exchangeRequestA = await call<{ request: { id: string; offeredItem: { id: string } } }>("/requests", { method: "POST", token: requester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOfferItemId, message: "I can offer my course book." } });
  requireCheck(exchangeRequestA.status === 201 && exchangeRequestA.data.request.offeredItem.id === exchangeOfferItemId, "A requester could not submit a real item-for-item exchange.");
  exchangeRequestId = exchangeRequestA.data.request.id;
  const exchangeRequestB = await call<{ request: { id: string; offeredItem: { id: string } } }>("/requests", { method: "POST", token: secondRequester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOtherOfferItemId } });
  requireCheck(exchangeRequestB.status === 201, "An exchange listing could not receive multiple offered-item requests.");
  exchangeSecondRequestId = exchangeRequestB.data.request.id;
  const exchangesForHolder = await call<{ requests: Array<{ id: string; offeredItem: { id: string } | null }> }>("/requests?direction=received&limit=50", { token: owner.token });
  requireCheck(exchangesForHolder.status === 200 && exchangesForHolder.data.requests.find((row) => row.id === exchangeRequestId)?.offeredItem?.id === exchangeOfferItemId, "The holder could not see the offered item details.");
  requireCheck((await call(`/requests/${exchangeRequestId}/accept`, { method: "POST", token: owner.token })).status === 200, "The holder could not accept an exchange offer.");
  const itemLocks = await prisma.item.findMany({ where: { id: { in: [exchangeItemId, exchangeOfferItemId] } }, select: { id: true, activeExchangeRequestId: true } });
  requireCheck(itemLocks.length === 2 && itemLocks.every((entry) => entry.activeExchangeRequestId === exchangeRequestId), "Both exchange items were not locked to one transaction.");
  requireCheck((await call(`/requests/${exchangeSecondRequestId}/accept`, { method: "POST", token: owner.token })).status === 409, "A second exchange transaction became active for the requested item.");
  requireCheck((await call("/requests", { method: "POST", token: secondRequester.token, body: { itemId: exchangeOfferItemId, offeredItemId: exchangeOtherOfferItemId } })).status === 409, "An item locked in an exchange was allowed into another transaction.");
  requireCheck((await call(`/requests/${exchangeRequestId}/cancel`, { method: "POST", token: requester.token })).status === 200, "An active exchange could not be cancelled.");
  const releasedFirstPair = await prisma.item.findMany({ where: { id: { in: [exchangeItemId, exchangeOfferItemId] } }, select: { id: true, status: true, activeExchangeRequestId: true } });
  requireCheck(releasedFirstPair.length === 2 && releasedFirstPair.every((entry) => entry.activeExchangeRequestId === null) && releasedFirstPair.find((entry) => entry.id === exchangeOfferItemId)?.status === "AVAILABLE", "Cancelling an exchange did not release both item locks.");
  requireCheck((await call(`/requests/${exchangeSecondRequestId}/accept`, { method: "POST", token: owner.token })).status === 200, "Another pending exchange was not eligible after cancellation.");
  requireCheck((await call(`/requests/${exchangeSecondRequestId}/cancel`, { method: "POST", token: secondRequester.token })).status === 200, "The replacement active exchange could not be cancelled.");
  const releasedSecondPair = await prisma.item.findMany({ where: { id: { in: [exchangeItemId, exchangeOtherOfferItemId] } }, select: { id: true, status: true, activeExchangeRequestId: true } });
  requireCheck(releasedSecondPair.length === 2 && releasedSecondPair.every((entry) => entry.activeExchangeRequestId === null && entry.status === "AVAILABLE"), "Cancelling the replacement exchange did not make its items eligible again.");
  const retryA = await call<{ request: { id: string } }>("/requests", { method: "POST", token: requester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOfferItemId } });
  requireCheck(retryA.status === 201, "The requester could not submit a new exchange after cancellation.");
  exchangeRequestId = retryA.data.request.id;
  const retryB = await call<{ request: { id: string } }>("/requests", { method: "POST", token: secondRequester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOtherOfferItemId } });
  requireCheck(retryB.status === 201, "A new pending exchange could not be created after cancellation.");
  exchangeSecondRequestId = retryB.data.request.id;
  requireCheck((await call(`/requests/${exchangeRequestId}/accept`, { method: "POST", token: owner.token })).status === 200, "The holder could not restart the exchange after cancellation.");
  const factors = await call<{ factors: Array<{ category: string; subcategory: string; factorKgCO2e: number | string | null }> }>("/sustainability/factors");
  requireCheck(factors.status === 200 && factors.data.factors.some((factor) => factor.category === "stationery" && factor.subcategory === "calculator" && factor.factorKgCO2e === null), "Reference factor data or unavailable-factor handling failed.");
  requireCheck((await call<{ displacementFactor: number }>("/sustainability/methodology")).data.displacementFactor === 0.5, "Sustainability methodology configuration endpoint failed.");
  const created = await call<{ item: { id: string } }>("/items", {
    method: "POST", token: owner.token,
    body: { title: `Smoke Donation ${suffix}`, description: "Temporary local integration check.", condition: "GOOD", exchangeType: "DONATION", estimatedWeightKg: 1.2, categoryId: bookCategory!.id },
  });
  requireCheck(created.status === 201, "Donation listing creation failed.");
  itemId = created.data.item.id;
  const search = await call<{ items: Array<{ id: string }>; pagination: { page: number; limit: number } }>(`/items?search=${encodeURIComponent(`Smoke Donation ${suffix}`)}&page=1&limit=1`);
  requireCheck(search.status === 200 && search.data.items.some((item) => item.id === itemId) && search.data.pagination.limit === 1, "Search or pagination failed.");

  const requested = await call<{ request: { id: string } }>("/requests", {
    method: "POST", token: requester.token, body: { itemId, message: "I would like to reuse this item." },
  });
  requireCheck(requested.status === 201, "Donation listing could not be requested.");
  requestId = requested.data.request.id;
  const secondRequested = await call<{ request: { id: string } }>("/requests", { method: "POST", token: secondRequester.token, body: { itemId, message: "I can use this for my class." } });
  requireCheck(secondRequested.status === 201, "A listing with a pending request could not receive another request.");
  const incoming = await call<{ requests: Array<{ id: string; status: string }> }>("/requests?direction=received&limit=50", { token: owner.token });
  requireCheck(incoming.status === 200 && incoming.data.requests.filter((entry) => [requestId, secondRequested.data.request.id].includes(entry.id)).length === 2, "Holder could not see all listing requests.");
  requireCheck((await call(`/requests/${requestId}/accept`, { method: "POST", token: owner.token })).status === 200, "Owner could not accept the request.");
  requireCheck((await call(`/requests/${secondRequested.data.request.id}/accept`, { method: "POST", token: owner.token })).status === 409, "A second active transaction was allowed for the listing.");
  const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1);
  const handoverDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
  requireCheck((await call(`/requests/${exchangeRequestId}/handover`, { method: "POST", token: owner.token, body: { meetingPoint: "LIBRARY", date: handoverDate, time: "15:30" } })).status === 200, "Exchange holder could not propose a handover slot.");
  requireCheck((await call(`/requests/${exchangeRequestId}/handover/response`, { method: "PATCH", token: requester.token, body: { decision: "REJECT" } })).status === 200, "Exchange requester could not reject a proposed slot.");
  requireCheck((await call(`/requests/${exchangeRequestId}/handover`, { method: "POST", token: owner.token, body: { meetingPoint: "MAIN_GATE", date: handoverDate, time: "16:00" } })).status === 200, "Exchange holder could not propose a replacement slot.");
  requireCheck((await call(`/requests/${exchangeRequestId}/handover/response`, { method: "PATCH", token: requester.token, body: { decision: "ACCEPT" } })).status === 200, "Exchange requester could not accept a handover slot.");
  const exchangeCode = await call<{ code: string }>(`/requests/${exchangeRequestId}/handover/code`, { method: "POST", token: requester.token });
  requireCheck(exchangeCode.status === 200 && /^\d{4}$/.test(exchangeCode.data.code), "Exchange requester could not generate the secure four-digit code.");
  const invalidExchangeCode = exchangeCode.data.code === "0000" ? "0001" : "0000";
  requireCheck((await call(`/requests/${exchangeRequestId}/complete`, { method: "POST", token: owner.token, body: { code: invalidExchangeCode } })).status === 400, "An invalid exchange handover code was accepted.");
  requireCheck((await call(`/requests/${exchangeRequestId}/complete`, { method: "POST", token: owner.token, body: { code: exchangeCode.data.code } })).status === 200, "A valid exchange handover code could not complete the exchange.");
  const completedExchangeItems = await prisma.item.findMany({ where: { id: { in: [exchangeItemId, exchangeOfferItemId] } }, select: { id: true, status: true, activeExchangeRequestId: true } });
  requireCheck(completedExchangeItems.length === 2 && completedExchangeItems.every((entry) => entry.status === "EXCHANGED" && entry.activeExchangeRequestId === null), "Exchange completion did not complete and unlock both items.");
  requireCheck((await call(`/chats/${exchangeRequestId}/messages`, { method: "POST", token: owner.token, body: { body: "Completed exchange chat must stay read-only." } })).status === 409, "Completed exchange chat accepted a new message.");
  requireCheck((await call("/requests", { method: "POST", token: secondRequester.token, body: { itemId: exchangeItemId, offeredItemId: exchangeOtherOfferItemId } })).status === 409, "A completed exchange item accepted a new request.");
  const losingExchangeRequest = await prisma.exchangeRequest.findUnique({ where: { id: exchangeSecondRequestId }, select: { status: true } });
  requireCheck(losingExchangeRequest?.status === "REJECTED", "Other exchange requests were not closed after completion.");
  const proposed = await call(`/requests/${requestId}/handover`, { method: "POST", token: owner.token, body: { meetingPoint: "LIBRARY", date: handoverDate, time: "16:30" } });
  requireCheck(proposed.status === 200, "Holder could not propose a handover slot.");
  requireCheck((await call(`/requests/${requestId}/handover/response`, { method: "PATCH", token: requester.token, body: { decision: "REJECT" } })).status === 200, "Requester could not reject a handover slot.");
  const rejected = await call<{ requests: Array<{ id: string; handoverStatus: string }> }>("/requests?direction=received&limit=50", { token: owner.token });
  requireCheck(rejected.data.requests.find((entry) => entry.id === requestId)?.handoverStatus === "REJECTED", "Holder was not shown the rejected proposal.");
  requireCheck((await call(`/requests/${requestId}/handover`, { method: "POST", token: owner.token, body: { meetingPoint: "MAIN_GATE", date: handoverDate, time: "17:00" } })).status === 200, "Holder could not propose a replacement slot.");
  requireCheck((await call(`/requests/${requestId}/handover/response`, { method: "PATCH", token: requester.token, body: { decision: "ACCEPT" } })).status === 200, "Requester could not accept the handover slot.");
  const codeResult = await call<{ code: string }>(`/requests/${requestId}/handover/code`, { method: "POST", token: requester.token });
  requireCheck(codeResult.status === 200 && /^\d{4}$/.test(codeResult.data.code), "Requester could not generate a secure 4-digit code.");
  const holderView = await call<{ requests: Array<Record<string, unknown>> }>("/requests?direction=received&limit=50", { token: owner.token });
  const ownerRequest = holderView.data.requests.find((entry) => entry.id === requestId);
  requireCheck(ownerRequest && !("handoverCodeHash" in ownerRequest) && !("code" in ownerRequest), "Holder-facing request data exposed the buyer's handover code.");
  requireCheck((await call(`/chats/${requestId}/messages`, { method: "POST", token: requester.token, body: { body: "I will meet you at the library." } })).status === 201, "Accepted participants could not send chat messages.");
  const ownerMessages = await call<{ messages: Array<{ body: string; readAt: string | null }> }>(`/chats/${requestId}/messages`, { token: owner.token });
  requireCheck(ownerMessages.status === 200 && ownerMessages.data.messages[0]?.body === "I will meet you at the library." && ownerMessages.data.messages[0].readAt, "Participant chat or read status failed.");
  requireCheck((await call(`/chats/${requestId}/messages`, { method: "POST", token: owner.token, body: { body: "See you there." } })).status === 201, "Second chat participant could not reply.");
  const wrongCode = codeResult.data.code === "0000" ? "0001" : "0000";
  const wrongVerification = await call<{ error: string }>(`/requests/${requestId}/complete`, { method: "POST", token: owner.token, body: { code: wrongCode } });
  requireCheck(wrongVerification.status === 400 && wrongVerification.data.error === "Invalid handover code. Please try again.", "Invalid handover code was not safely rejected.");
  requireCheck((await call(`/requests/${requestId}/complete`, { method: "POST", token: requester.token, body: { code: codeResult.data.code } })).status === 404, "A non-holder was allowed to confirm the transaction.");
  requireCheck((await call(`/requests/${requestId}/complete`, { method: "POST", token: owner.token, body: { code: codeResult.data.code } })).status === 200, "The item holder could not verify the buyer's handover code.");
  requireCheck((await call(`/requests/${requestId}/complete`, { method: "POST", token: owner.token, body: { code: codeResult.data.code } })).status === 409, "A used handover code completed the transaction twice.");
  requireCheck((await call(`/chats/${requestId}/messages`, { method: "POST", token: owner.token, body: { body: "This must remain read-only." } })).status === 409, "A completed transaction chat accepted a new message.");
  requireCheck((await call(`/requests/${requestId}/rating`, { method: "POST", token: requester.token, body: { score: 5, feedback: "Easy campus pickup." } })).status === 201, "Completed participant could not rate the transaction.");
  requireCheck((await call(`/requests/${requestId}/rating`, { method: "POST", token: requester.token, body: { score: 5 } })).status === 409, "Duplicate transaction rating was not prevented.");
  const ownerReputation = await call<{ ratingCount: number; averageRating: number }>('/requests/reputation/' + ownerId);
  requireCheck(ownerReputation.status === 200 && ownerReputation.data.ratingCount === 1 && ownerReputation.data.averageRating === 5, "Completed transaction reputation aggregate failed.");
  const lifecycle = await call<{ events: Array<{ event: string }> }>(`/items/${itemId}/lifecycle`);
  requireCheck(lifecycle.status === 200 && lifecycle.data.events.some((entry) => entry.event === "LISTED") && lifecycle.data.events.some((entry) => entry.event === "HANDOVER_PROPOSED") && lifecycle.data.events.some((entry) => entry.event === "DONATED"), "Item lifecycle history failed.");

  const [item, donation, metrics, notifications] = await Promise.all([
    prisma.item.findUnique({ where: { id: itemId }, select: { status: true } }),
    prisma.donation.findUnique({ where: { itemId } }),
    prisma.sustainabilityMetric.findMany({ where: { itemId } }),
    prisma.notification.findMany({ where: { exchangeRequestId: requestId } }),
  ]);
  requireCheck(item?.status === "DONATED", "Donation did not mark the item as DONATED.");
  requireCheck(Boolean(donation), "Donation record is missing.");
  requireCheck(metrics.length === 2, "Expected a sustainability contribution for both participants.");
  requireCheck(notifications.filter((notification) => notification.type === "DONATION_COMPLETED").length === 2, "Both participants should be notified of a completed donation.");
  const losingRequest = await prisma.exchangeRequest.findUnique({ where: { id: secondRequested.data.request.id }, select: { status: true } });
  requireCheck(losingRequest?.status === "REJECTED", "Other pending requests were not closed after the listing completed.");

  const userReport = await call<{ report: { id: string } }>("/community/reports", { method: "POST", token: requester.token, body: { targetUserId: ownerId, category: "SUSPICIOUS_USER", description: "Temporary moderation smoke report." } });
  requireCheck(userReport.status === 201, "A member could not report a suspicious user.");
  reportId = userReport.data.report.id;
  requireCheck((await call("/admin/reports", { token: requester.token })).status === 403, "A member could access the admin moderation queue.");
  await prisma.user.update({ where: { id: ownerId }, data: { role: "ADMIN" } });
  const reportQueue = await call<{ reports: Array<{ id: string }> }>("/admin/reports", { token: owner.token });
  requireCheck(reportQueue.status === 200 && reportQueue.data.reports.some((report) => report.id === reportId), "Admin report queue failed.");
  requireCheck((await call(`/admin/reports/${reportId}`, { method: "PATCH", token: owner.token, body: { status: "REVIEWING", resolution: "Reviewed in smoke check." } })).status === 200, "Admin could not update a report status.");
  const campaignNow = new Date();
  const { date: today, time: nowTime } = kolkataParts(campaignNow);
  const tomorrow = shiftDate(today, 1);
  const dayAfter = shiftDate(today, 2);
  const campaignBody = { title: `Smoke Campaign ${suffix}`, description: "Temporary campaign integration check.", categoryIds: [bookCategory!.id], location: "Library foyer", instructions: "Bring clean items.", startDate: tomorrow, startTime: "16:00", endDate: tomorrow, endTime: "19:00" };
  requireCheck((await call("/community/campaigns", { method: "POST", token: requester.token, body: campaignBody })).status === 403, "A student could create a donation campaign through the API.");
  requireCheck((await call("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, categoryIds: ["not-a-real-category"] } })).status === 400, "Campaign creation accepted an unknown category ID.");
  requireCheck((await call("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, startDate: shiftDate(today, -1) } })).status === 400, "Campaign creation accepted a start date in the past.");
  requireCheck((await call("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, startDate: dayAfter, startTime: "16:00", endDate: tomorrow, endTime: "19:00" } })).status === 400, "Campaign creation accepted an end date before its start date.");
  requireCheck((await call("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, startTime: "16:00", endTime: "15:00" } })).status === 400, "Campaign creation accepted an end time before its start time on the same date.");
  requireCheck((await call("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, startDate: today, startTime: "00:00", endDate: today, endTime: "01:00" } })).status === 400, "Campaign creation accepted a time that has passed today.");
  const futureInstant = kolkataParts(new Date(Date.now() + 30 * 60_000));
  const futureEnd = kolkataParts(new Date(Date.now() + 90 * 60_000));
  const todayFutureAllowed = await call<{ campaign: { id: string } }>("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, startDate: futureInstant.date, startTime: futureInstant.time, endDate: futureEnd.date, endTime: futureEnd.time } });
  requireCheck(todayFutureAllowed.status === 201, `A future start time today was rejected (${nowTime}; HTTP ${todayFutureAllowed.status}: ${JSON.stringify(todayFutureAllowed.data)}).`);
  await prisma.donationCampaign.delete({ where: { id: todayFutureAllowed.data.campaign.id } });
  const multiDayCampaign = await call<{ campaign: { id: string } }>("/community/campaigns", { method: "POST", token: owner.token, body: { ...campaignBody, endDate: dayAfter, endTime: "10:00" } });
  requireCheck(multiDayCampaign.status === 201, "A campaign ending on a later date was rejected.");
  await prisma.donationCampaign.delete({ where: { id: multiDayCampaign.data.campaign.id } });
  const campaign = await call<{ campaign: { id: string } }>("/community/campaigns", { method: "POST", token: owner.token, body: campaignBody });
  requireCheck(campaign.status === 201, "Admin could not create a donation campaign.");
  campaignId = campaign.data.campaign.id;
  // The feature under test rejects past starts. Make this fixture live only after
  // verifying creation, so contribution and student-submission integration checks can run now.
  await prisma.donationCampaign.update({ where: { id: campaignId }, data: { startDate: new Date(Date.now() - 60_000) } });
  const completedDonation = await prisma.donation.findUnique({ where: { itemId } });
  requireCheck(Boolean(completedDonation), "Completed donation record is unavailable for campaign contribution.");
  requireCheck((await call(`/community/campaigns/${campaignId}/contributions`, { method: "POST", token: owner.token, body: { donationId: completedDonation!.id } })).status === 201, "Donor could not contribute a completed donation to a campaign.");
  requireCheck((await call(`/community/campaigns/${campaignId}/contributions`, { method: "POST", token: owner.token, body: { donationId: completedDonation!.id } })).status === 409, "Duplicate campaign donation contribution was not prevented.");
  const studentCampaigns = await call<{ campaigns: Array<{ id: string; location: string; acceptedCategories: string }> }>("/community/campaigns");
  requireCheck(studentCampaigns.status === 200 && studentCampaigns.data.campaigns.some((entry) => entry.id === campaignId && entry.location === "Library foyer"), "Students could not see the admin-selected campaign location.");
  const campaignSubmission = await call<{ donation: { id: string } }>(`/community/campaigns/${campaignId}/donations`, { method: "POST", token: requester.token, body: { category: bookCategory!.name, itemDetails: "Two clean course books." } });
  requireCheck(campaignSubmission.status === 201, `Student campaign donation submission failed (HTTP ${campaignSubmission.status}: ${JSON.stringify(campaignSubmission.data)}).`);
  requireCheck((await call(`/admin/campaigns/${campaignId}`, { method: "PATCH", token: requester.token, body: { location: "Student-selected location" } })).status === 403, "A student could change the official campaign location.");
  const adminSubmissions = await call<{ donations: Array<{ id: string; user: { id: string }; category: string }> }>(`/admin/campaigns/${campaignId}/donations`, { token: owner.token });
  requireCheck(adminSubmissions.status === 200 && adminSubmissions.data.donations.some((entry) => entry.id === campaignSubmission.data.donation.id && entry.user.id === requesterId), "Admin could not view campaign donation submissions.");
  requireCheck((await call(`/admin/campaign-donations/${campaignSubmission.data.donation.id}`, { method: "PATCH", token: owner.token, body: { status: "RECEIVED" } })).status === 200, "Admin could not update campaign donation status.");
  const campaignPhoto = new FormData();
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6l8AAAAASUVORK5CYII=", "base64");
  campaignPhoto.append("image", new Blob([tinyPng], { type: "image/png" }), "campaign.png");
  const uploadedCampaign = await uploadCall<{ campaign: { imageUrl: string | null } }>(`/admin/campaigns/${campaignId}/image`, owner.token, campaignPhoto);
  requireCheck(uploadedCampaign.status === 200 && Boolean(uploadedCampaign.data.campaign.imageUrl?.startsWith("/uploads/")), "Admin could not upload a campaign image.");
  const campaignImageResponse = await fetch(`${baseUrl.replace(/\/api$/, "")}${uploadedCampaign.data.campaign.imageUrl}`);
  requireCheck(campaignImageResponse.status === 200, "Uploaded campaign image could not be served.");
  requireCheck((await call(`/admin/campaigns/${campaignId}`, { method: "PATCH", token: owner.token, body: { location: "Student Activity Center" } })).status === 200, "Admin could not edit official campaign details.");
  requireCheck((await call(`/admin/campaigns/${campaignId}`, { method: "DELETE", token: owner.token })).status === 200, "Admin could not delete a campaign.");
  campaignId = undefined;
  requireCheck((await fetch(`${baseUrl.replace(/\/api$/, "")}${uploadedCampaign.data.campaign.imageUrl}`)).status === 404, "Deleting a campaign did not remove its uploaded image.");
  await prisma.user.update({ where: { id: ownerId }, data: { role: "USER" } });
  const goal = await call<{ goal: { id: string } }>("/community/goals", { method: "POST", token: requester.token, body: { title: `Smoke Goal ${suffix}`, metric: "REUSE", target: 1 } });
  requireCheck(goal.status === 201, "Member could not create a personal sustainability goal.");
  goalId = goal.data.goal.id;
  const goals = await call<{ goals: Array<{ id: string; progress: number; completed: boolean }> }>("/community/goals", { token: requester.token });
  requireCheck(goals.status === 200 && goals.data.goals.some((entry) => entry.id === goalId && entry.progress >= 1 && entry.completed), "Personal goal progress was not derived from completed activity.");
  const achievements = await call<{ achievements: Array<{ id: string; unlocked: boolean }> }>("/community/achievements", { token: requester.token });
  requireCheck(achievements.status === 200 && achievements.data.achievements.some((entry) => entry.id === "first-reuse" && entry.unlocked), "Completed activity did not unlock an achievement.");

  const directListing = await call<{ item: { id: string } }>("/items", {
    method: "POST", token: owner.token,
    body: { title: `Smoke Direct Donation ${suffix}`, description: "Temporary direct donation check.", condition: "GOOD", exchangeType: "EXCHANGE", categoryId: bookCategory!.id },
  });
  requireCheck(directListing.status === 201, "Direct donation test listing creation failed.");
  directItemId = directListing.data.item.id;
  requireCheck((await call(`/donations/${directItemId}/mark`, { method: "POST", token: owner.token })).status === 200, "Owner could not mark an item as donation-based.");
  requireCheck((await call(`/donations/${directItemId}/complete`, { method: "POST", token: owner.token })).status === 201, "Direct donation could not be recorded.");
  const directDonation = await prisma.donation.findUnique({ where: { itemId: directItemId }, include: { item: { select: { status: true } } } });
  requireCheck(directDonation?.item.status === "DONATED", "Direct donation did not mark its item as DONATED.");

  const saleListing = await call<{ item: { id: string; price: string; priceNegotiable: boolean } }>("/items", {
    method: "POST", token: owner.token,
    body: { title: `Smoke Sale ${suffix}`, description: "Temporary sale listing check.", condition: "GOOD", exchangeType: "SALE", price: 500, priceNegotiable: true, categoryId: bookCategory!.id },
  });
  requireCheck(saleListing.status === 201 && Number(saleListing.data.item.price) === 500 && saleListing.data.item.priceNegotiable, "Sale listing creation failed.");
  saleItemId = saleListing.data.item.id;
  const saleSearch = await call<{ items: Array<{ id: string }> }>(`/items?exchangeType=SALE&minPrice=400&maxPrice=600&negotiable=true&sort=lowestPrice`);
  requireCheck(saleSearch.status === 200 && saleSearch.data.items.some((entry) => entry.id === saleItemId), "Sale price filters failed.");
  requireCheck((await call(`/wishlist/${saleItemId}`, { method: "POST", token: requester.token })).status === 201, "Wishlist save failed.");
  requireCheck((await call(`/wishlist/${saleItemId}`, { method: "POST", token: requester.token })).status === 201, "Repeated wishlist save was not idempotent.");
  const wishlist = await call<{ items: Array<{ id: string }> }>("/wishlist", { token: requester.token });
  requireCheck(wishlist.status === 200 && wishlist.data.items.filter((entry) => entry.id === saleItemId).length === 1, "Wishlist duplicate prevention failed.");
  const recommendations = await call<{ recommendations: Array<{ item: { id: string } }>; method: string }>("/items/recommended", { token: requester.token });
  requireCheck(recommendations.status === 200 && recommendations.data.recommendations.some((entry) => entry.item.id === saleItemId) && recommendations.data.method.includes("no AI"), "Rule-based recommendations failed.");
  requireCheck((await call(`/wishlist/${saleItemId}`, { method: "DELETE", token: requester.token })).status === 200, "Wishlist removal failed.");
  requireCheck((await call(`/wishlist/${saleItemId}`, { method: "POST", token: requester.token })).status === 201, "Wishlist re-save failed.");
  const saleRequested = await call<{ request: { id: string } }>("/requests", {
    method: "POST", token: requester.token, body: { itemId: saleItemId, message: "I can collect this on campus." },
  });
  requireCheck(saleRequested.status === 201, "Purchase request could not be sent.");
  saleRequestId = saleRequested.data.request.id;
  const secondSaleRequest = await call<{ request: { id: string } }>("/requests", { method: "POST", token: secondRequester.token, body: { itemId: saleItemId, message: "I need this for my class." } });
  requireCheck(secondSaleRequest.status === 201, "Second purchase request could not be sent.");
  requireCheck((await call(`/requests/${saleRequestId}/accept`, { method: "POST", token: owner.token })).status === 200, "Sale request could not be accepted.");
  requireCheck((await call(`/requests/${saleRequestId}/complete`, { method: "POST", token: owner.token, body: { code: "0000" } })).status === 409, "Transaction completion was allowed before the buyer accepted a handover proposal.");
  requireCheck((await call(`/requests/${secondSaleRequest.data.request.id}/accept`, { method: "POST", token: owner.token })).status === 409, "A second active sale transaction was allowed.");
  requireCheck((await call(`/requests/${saleRequestId}/cancel`, { method: "POST", token: requester.token })).status === 200, "An accepted transaction could not be cancelled before handover.");
  const stillPending = await prisma.exchangeRequest.findUnique({ where: { id: secondSaleRequest.data.request.id }, select: { status: true } });
  requireCheck(stillPending?.status === "PENDING", "Cancelling the active transaction removed another pending request.");
  requireCheck((await call(`/requests/${secondSaleRequest.data.request.id}/accept`, { method: "POST", token: owner.token })).status === 200, "The holder could not accept another request after cancellation.");
  requireCheck((await call(`/requests/${secondSaleRequest.data.request.id}/handover`, { method: "POST", token: owner.token, body: { meetingPoint: "MAIN_GATE", date: handoverDate, time: "18:00" } })).status === 200, "Sale handover could not be proposed.");
  requireCheck((await call(`/requests/${secondSaleRequest.data.request.id}/handover/response`, { method: "PATCH", token: secondRequester.token, body: { decision: "ACCEPT" } })).status === 200, "Buyer could not accept the sale handover slot.");
  const saleCode = await call<{ code: string }>(`/requests/${secondSaleRequest.data.request.id}/handover/code`, { method: "POST", token: secondRequester.token });
  requireCheck(saleCode.status === 200 && /^\d{4}$/.test(saleCode.data.code), "Buyer could not generate a sale handover code.");
  requireCheck((await call(`/requests/${secondSaleRequest.data.request.id}/complete`, { method: "POST", token: owner.token, body: { code: saleCode.data.code } })).status === 200, "Sale could not be completed by code verification.");
  const sold = await prisma.item.findUnique({ where: { id: saleItemId }, select: { status: true } });
  requireCheck(sold?.status === "SOLD", "Completed sale did not mark the item as SOLD.");
  const saleMetrics = await prisma.sustainabilityMetric.count({ where: { itemId: saleItemId, eventType: "SALE_COMPLETED" } });
  requireCheck(saleMetrics === 2, "Completed sale did not record contributions for both participants.");
  const calculation = await prisma.sustainabilityCalculation.findUnique({ where: { itemId }, include: { emissionFactor: true } });
  requireCheck(Number(calculation?.referenceFactor) === 2.46 && Number(calculation?.displacementFactor) === 0.5 && Number(calculation?.netAvoidedCO2e) === 1.23 && calculation?.emissionFactor?.sourceUrl.includes("doi.org"), "Historical source-backed calculation breakdown failed.");
  const leaderboard = await call<{ leaderboard: Array<{ userId: string; points: number }> }>("/sustainability/leaderboard");
  requireCheck(leaderboard.status === 200 && leaderboard.data.leaderboard.some((entry) => entry.userId === ownerId && entry.points > 0), "Completed-transaction leaderboard failed.");

  console.log("ReUseHub API smoke checks passed (item-for-item exchange offers, ownership and self-exchange guards, multi-request selection, dual-item locks and cancellation release, replacement handovers, buyer codes, atomic completion, read-only chat, admin campaigns, auth, listings, donations, sustainability, metrics, and notifications).");
} finally {
  if (saleRequestId) await prisma.notification.deleteMany({ where: { exchangeRequestId: saleRequestId } });
  if (requestId) await prisma.notification.deleteMany({ where: { exchangeRequestId: requestId } });
  const exchangeRequestIds = [exchangeRequestId, exchangeSecondRequestId].filter((id): id is string => Boolean(id));
  const exchangeItemIds = [exchangeItemId, exchangeOfferItemId, exchangeOtherOfferItemId].filter((id): id is string => Boolean(id));
  if (exchangeRequestIds.length) await prisma.notification.deleteMany({ where: { exchangeRequestId: { in: exchangeRequestIds } } });
  if (reportId) await prisma.itemReport.deleteMany({ where: { id: reportId } });
  if (campaignId) await prisma.campaignContribution.deleteMany({ where: { campaignId } });
  if (campaignId) await prisma.donationCampaign.deleteMany({ where: { id: campaignId } });
  if (goalId) await prisma.sustainabilityGoal.deleteMany({ where: { id: goalId } });
  const userIds = [ownerId, requesterId, secondRequesterId].filter((id): id is string => Boolean(id));
  if (userIds.length) await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } });
  if (exchangeItemIds.length) {
    await prisma.sustainabilityCalculation.deleteMany({ where: { itemId: { in: exchangeItemIds } } });
    await prisma.sustainabilityMetric.deleteMany({ where: { itemId: { in: exchangeItemIds } } });
    await prisma.exchangeRequest.deleteMany({ where: { OR: [{ itemId: { in: exchangeItemIds } }, { offeredItemId: { in: exchangeItemIds } }] } });
    await prisma.item.deleteMany({ where: { id: { in: exchangeItemIds } } });
  }
  if (itemId) {
    await prisma.sustainabilityCalculation.deleteMany({ where: { itemId } });
    await prisma.donation.deleteMany({ where: { itemId } });
    await prisma.exchangeRequest.deleteMany({ where: { itemId } });
    await prisma.sustainabilityMetric.deleteMany({ where: { itemId } });
    await prisma.item.deleteMany({ where: { id: itemId } });
  }
  if (directItemId) {
    await prisma.sustainabilityCalculation.deleteMany({ where: { itemId: directItemId } });
    await prisma.donation.deleteMany({ where: { itemId: directItemId } });
    await prisma.sustainabilityMetric.deleteMany({ where: { itemId: directItemId } });
    await prisma.item.deleteMany({ where: { id: directItemId } });
  }
  if (saleItemId) {
    await prisma.sustainabilityCalculation.deleteMany({ where: { itemId: saleItemId } });
    await prisma.wishlist.deleteMany({ where: { itemId: saleItemId } });
    await prisma.exchangeRequest.deleteMany({ where: { itemId: saleItemId } });
    await prisma.sustainabilityMetric.deleteMany({ where: { itemId: saleItemId } });
    await prisma.item.deleteMany({ where: { id: saleItemId } });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}
