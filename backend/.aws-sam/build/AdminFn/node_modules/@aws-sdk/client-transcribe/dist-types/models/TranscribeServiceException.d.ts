import { type ServiceExceptionOptions as __ServiceExceptionOptions, ServiceException as __ServiceException } from "@smithy/core/client";
export type { __ServiceExceptionOptions };
export { __ServiceException };
/**
 * @public
 *
 * Base exception class for all service exceptions from Transcribe service.
 */
export declare class TranscribeServiceException extends __ServiceException {
    /**
     * @internal
     */
    constructor(options: __ServiceExceptionOptions);
}
