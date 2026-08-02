import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest { return { name: 'Watch Bracket', short_name: 'Watch Bracket', description: 'Choose tonight\'s watch together.', start_url: '/', display: 'standalone', background_color: '#090912', theme_color: '#090912' }; }

