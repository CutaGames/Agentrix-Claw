/**
 * useCapableDevices — polls the user's online desktops that can execute a
 * given compute capability. Used by PetCreator to show "your Alienware is
 * online, route here" UX.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchCapableDevices, type ComputeCapability, type CapableDevice } from '../services/compute.api';

export function useCapableDevices(requires: ComputeCapability = 'pet_gen'): {
  devices: CapableDevice[];
  isLoading: boolean;
  hasCapable: boolean;
  topDevice: CapableDevice | null;
} {
  const q = useQuery({
    queryKey: ['compute-devices', requires],
    queryFn: () => fetchCapableDevices(requires),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
  });
  const devices = q.data?.items ?? [];
  return {
    devices,
    isLoading: q.isLoading,
    hasCapable: devices.length > 0,
    topDevice: devices[0] ?? null,
  };
}
