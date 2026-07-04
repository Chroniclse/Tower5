import type { ExceptionOptionType as __ExceptionOptionType } from "@smithy/core/client";
import { TranscribeServiceException as __BaseException } from "./TranscribeServiceException";
/**
 * <p>Your request didn't pass one or more validation tests. This can occur when the entity
 *             you're trying to delete doesn't exist or if it's in a non-terminal state (such as
 *                 <code>IN PROGRESS</code>). See the exception message field for more
 *             information.</p>
 * @public
 */
export declare class BadRequestException extends __BaseException {
    readonly name: "BadRequestException";
    readonly $fault: "client";
    Message?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<BadRequestException, __BaseException>);
}
/**
 * <p>A resource already exists with this name. Resource names must be unique within an
 *                 Amazon Web Services account.</p>
 * @public
 */
export declare class ConflictException extends __BaseException {
    readonly name: "ConflictException";
    readonly $fault: "client";
    Message?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
/**
 * <p>There was an internal error. Check the error message, correct the issue, and try your
 *             request again.</p>
 * @public
 */
export declare class InternalFailureException extends __BaseException {
    readonly name: "InternalFailureException";
    readonly $fault: "server";
    Message?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<InternalFailureException, __BaseException>);
}
/**
 * <p>You've either sent too many requests or your input file is too long. Wait before
 *             retrying your request, or use a smaller file and try your request again.</p>
 * @public
 */
export declare class LimitExceededException extends __BaseException {
    readonly name: "LimitExceededException";
    readonly $fault: "client";
    Message?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<LimitExceededException, __BaseException>);
}
/**
 * <p>We can't find the requested resource. Check that the specified name is correct and try
 *             your request again.</p>
 * @public
 */
export declare class NotFoundException extends __BaseException {
    readonly name: "NotFoundException";
    readonly $fault: "client";
    Message?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<NotFoundException, __BaseException>);
}
