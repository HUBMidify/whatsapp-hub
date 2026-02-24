import useSWR from "swr";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useMetrics<T>(url: string | null) {
  return useSWR<T>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    revalidateIfStale: true,
  });
}

export default useMetrics;