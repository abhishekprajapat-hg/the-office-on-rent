import React from "react";
import { getMyTargets } from "../../api/targets";
import { monthKeyOf, monthLabel } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import { Body, Card, ErrorState, Loading, Text } from "../../ui";
import { TargetCard } from "./LeaderboardScreen";

export const TargetsScreen = () => {
  const month = monthKeyOf();
  const { data, loading, error, refreshing, refresh } = useQuery(() => getMyTargets(month), [month]);

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Text variant="heading">{monthLabel(month)}</Text>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {data?.myTarget ? <TargetCard title="My targets" target={data.myTarget} /> : null}
      {data && !data.myTarget ? <Card><Text variant="small" color="muted">No target has been assigned for this month.</Text></Card> : null}
    </Body>
  );
};
