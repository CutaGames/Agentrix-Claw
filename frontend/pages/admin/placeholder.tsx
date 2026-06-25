import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';

export default function PlaceholderPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Page Under Maintenance</h1>
      <p className="text-gray-600 mb-8">This page is being updated to fix encoding issues.</p>
      <button 
        onClick={() => router.push('/admin')}
        className="flex items-center gap-2 text-indigo-600 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>
    </div>
  );
}
