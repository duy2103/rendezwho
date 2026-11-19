// Browser implementation; native builds resolve WorldMap.native.tsx.
import { useEffect, useRef, useState } from 'react';
import type { Map as BrowserMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle, pointBounds, type WorldMapProps } from '../lib/mapData';
import { Copy } from './ui';

export default function WorldMap({ points = [], center, onSelect, onPick }: WorldMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<BrowserMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onPick });
  useEffect(() => {
    callbacks.current = { onSelect, onPick };
  }, [onSelect, onPick]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void import('maplibre-gl')
      .then(({ Map, NavigationControl, setWorkerUrl }) => {
        if (!active || !container.current) return;
        try {
          setWorkerUrl(`${process.env.EXPO_BASE_URL ?? ''}/maplibre/maplibre-gl-worker.mjs`);
          const instance = new Map({
            container: container.current,
            style: mapStyle,
            center: [13.405, 52.52],
            zoom: 3,
          });
          map.current = instance;
          instance.addControl(new NavigationControl(), 'top-right');
          instance.on('load', () => {
            if (active) setReady(true);
          });
          instance.on('error', () => {
            if (active) setError('Map unavailable. You can still use the list.');
          });
          instance.on('click', (event) =>
            callbacks.current.onPick?.([event.lngLat.lng, event.lngLat.lat]),
          );
        } catch {
          setError('Map unavailable in this browser. You can still use the list.');
        }
      })
      .catch(() => {
        if (active) setError('Could not load the map.');
      });
    return () => {
      active = false;
      markers.current.forEach((m) => m.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    let active = true;
    void import('maplibre-gl').then(({ Marker }) => {
      if (!active || !map.current) return;
      markers.current.forEach((m) => m.remove());
      markers.current = points.map((point) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = point.kind === 'city' ? String(point.count ?? 1) : '●';
        button.setAttribute('aria-label', point.name);
        Object.assign(button.style, {
          background: point.kind === 'city' ? '#265f59' : '#bd6b39',
          color: 'white',
          border: '2px solid white',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          cursor: 'pointer',
        });
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          callbacks.current.onSelect?.(point.id);
        });
        return new Marker({ element: button })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map.current!);
      });
    });
    return () => {
      active = false;
    };
  }, [points, ready]);
  const hasCenter = Boolean(center);
  const [west, south, east, north] = pointBounds(points) ?? [];
  const lng = center?.[0] ?? points[0]?.longitude;
  const lat = center?.[1] ?? points[0]?.latitude;
  useEffect(() => {
    if (
      ready &&
      !hasCenter &&
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined
    ) {
      map.current?.fitBounds([west, south, east, north], { padding: 48, maxZoom: 12 });
      return;
    }
    if (ready && lng !== undefined && lat !== undefined)
      map.current?.flyTo({
        center: [lng, lat],
        zoom: hasCenter ? 12 : points.length === 1 ? 8 : 3,
      });
  }, [ready, lng, lat, hasCenter, points.length, west, south, east, north]);
  return (
    <>
      <div
        ref={container}
        style={{ height: 360, borderRadius: 24, overflow: 'hidden' }}
        aria-label="Interactive map"
      />
      {!!error && <Copy error>{error}</Copy>}
    </>
  );
}
