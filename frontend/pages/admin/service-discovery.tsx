import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader2, Search, CheckCircle2, Globe, Server, ShieldCheck } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { productApi } from '@/lib/api/product.api';
import { useRouter } from 'next/router';

export default function ServiceDiscoveryPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { success, error } = useToast();
  const router = useRouter();

  const handleDiscover = async () => {
    if (!url) return;
    
    // 绠€鍗曠殑 URL 鏍￠獙
    if (!url.startsWith('http')) {
        error("Invalid URL: Please enter a valid URL starting with http:// or https://");
        return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // 璋冪敤鍚庣 API (闇€瑕佺‘淇?productApi 涓湁 discover 鏂规硶锛屾垨鑰呯洿鎺?fetch)
      // 杩欓噷鍋囪 productApi 灏氭湭鏇存柊锛岀洿鎺ヤ娇鐢?fetch
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/products/discover', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ url })
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Discovery failed');
      }

      const data = await response.json();
      setResult(data);
      success(`Service Discovered! Successfully registered: ${data.name}`);
    } catch (err: any) {
      error(`Discovery Failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout 
      title="Service Discovery" 
      description="Import services automatically using the X402 V2 Protocol. Just enter the URL of any X402-compliant service."
    >
      <div className="container mx-auto max-w-4xl">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Import from URL</CardTitle>
              <CardDescription>
                Enter the base URL of the service provider. We will look for <code>/.well-known/x402.json</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="https://api.example.com" 
                    className="pl-9"
                    value={url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleDiscover()}
                  />
                </div>
                <Button onClick={handleDiscover} disabled={isLoading || !url}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Discover
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card className="border-green-500/50 bg-green-50/10">
              <CardHeader>
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <CardTitle>Service Registered Successfully</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-background rounded-lg border">
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <Server className="h-4 w-4" /> Service Details
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Name:</span>
                                <span className="font-medium">{result.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Price:</span>
                                <span className="font-medium">{result.price} {result.metadata?.x402?.token || 'ETH'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Category:</span>
                                <span className="font-medium">{result.category}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-background rounded-lg border">
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" /> X402 Configuration
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Scheme:</span>
                                <span className="font-medium font-mono">{result.metadata?.x402?.scheme}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Network:</span>
                                <span className="font-medium font-mono">{result.metadata?.x402?.network}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Recipient:</span>
                                <span className="font-medium font-mono text-xs truncate max-w-[150px]" title={result.metadata?.x402?.recipient}>
                                    {result.metadata?.x402?.recipient}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 mt-4">
                    <Button variant="outline" onClick={() => setResult(null)}>Scan Another</Button>
                    <Button onClick={() => router.push(`/products/${result.id}`)}>View Product Page</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
