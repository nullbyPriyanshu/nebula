import { DRIVE_API, gfetch } from "../google/drive";

export type StorageQuota = {
  total: number;
  used: number;
};

export async function getGoogleQuota(email: string): Promise<StorageQuota> {
  const response = await gfetch(
    email,
    `${DRIVE_API}/about?fields=storageQuota`,
  );

  const data = await response.json();

  const quota = data.storageQuota;

  // Never assume an absent limit means unlimited usable space.
  if (quota?.limit == null || quota?.usage == null) {
    return {
      total: 0,
      used: 0,
    };
  }

  return {
    total: Number(quota.limit),
    used: Number(quota.usage),
  };
}
