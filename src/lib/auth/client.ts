"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Talks to this deployment's own /api/auth routes.
 *
 * No baseURL: the client defaults to the current origin, which is what keeps
 * the same build working on localhost, on a preview URL and in production
 * without a rebuild.
 */
export const authClient = createAuthClient();

export const { useSession, signIn, signOut } = authClient;
