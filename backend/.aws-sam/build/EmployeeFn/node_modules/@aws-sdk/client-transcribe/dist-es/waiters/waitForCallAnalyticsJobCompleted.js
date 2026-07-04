import { checkExceptions, createWaiter, WaiterState, } from "@smithy/core/client";
import { GetCallAnalyticsJobCommand, } from "../commands/GetCallAnalyticsJobCommand";
const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new GetCallAnalyticsJobCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.CallAnalyticsJob.CallAnalyticsJobStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.CallAnalyticsJob.CallAnalyticsJobStatus;
            };
            if (returnComparator() === "FAILED") {
                return { state: WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: WaiterState.RETRY, reason };
};
export const waitForCallAnalyticsJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
export const waitUntilCallAnalyticsJobCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 10, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};
