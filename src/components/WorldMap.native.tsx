import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { mapStyle, pointBounds, pointsGeoJSON, type WorldMapProps } from '../lib/mapData';
import { Copy } from './ui';

export default function WorldMap({ points = [], center, onSelect, onPick }: WorldMapProps) {
  const camera = useRef<CameraRef>(null);
  const [failed, setFailed] = useState(false);
  const data = useMemo(() => pointsGeoJSON(points), [points]);
  const first = points[0];
  const lng = center?.[0] ?? first?.longitude ?? 13.405;
  const lat = center?.[1] ?? first?.latitude ?? 52.52;
  const hasCenter = Boolean(center);
  const [west, south, east, north] = pointBounds(points) ?? [];
  useEffect(() => {
    if (
      !hasCenter &&
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined
    ) {
      camera.current?.fitBounds([west, south, east, north], {
        padding: { top: 48, right: 48, bottom: 48, left: 48 },
        duration: 500,
      });
      return;
    }
    camera.current?.flyTo({
      center: [lng, lat],
      zoom: hasCenter ? 12 : points.length === 1 ? 8 : 3,
      duration: 500,
    });
  }, [lng, lat, hasCenter, points.length, west, south, east, north]);
  return (
    <View style={s.surface}>
      <Map
        style={s.map}
        mapStyle={mapStyle}
        onDidFailLoadingMap={() => setFailed(true)}
        onDidFinishLoadingMap={() => setFailed(false)}
        onPress={(event) => {
          if (onPick) onPick(event.nativeEvent.lngLat);
        }}
      >
        <Camera ref={camera} initialViewState={{ center: [lng, lat], zoom: 3 }} />
        <GeoJSONSource
          id="locations"
          data={data}
          onPress={(event) => {
            event.stopPropagation();
            const id = event.nativeEvent.features[0]?.properties?.id;
            if (typeof id === 'string') onSelect?.(id);
          }}
        >
          <Layer
            id="locations-circles"
            type="circle"
            paint={{
              'circle-radius': 12,
              'circle-color': ['match', ['get', 'kind'], 'city', '#265f59', '#bd6b39'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="locations-count"
            type="symbol"
            filter={['==', ['get', 'kind'], 'city']}
            layout={{ 'text-field': ['to-string', ['get', 'count']], 'text-size': 12 }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>
      </Map>
      {failed && (
        <View style={s.error}>
          <Copy error>Map unavailable. Your places and trips are still available in the list.</Copy>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  surface: { height: 360, borderRadius: 24, overflow: 'hidden', backgroundColor: '#e6f5f2' },
  map: { flex: 1 },
  error: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'white',
    padding: 12,
  },
});
