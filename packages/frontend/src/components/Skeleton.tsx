import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({ width, height, className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton shimmer ${className}`.trim()}
      style={{ width, height, ...style }}
    />
  );
}
