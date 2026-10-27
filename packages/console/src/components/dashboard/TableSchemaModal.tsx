import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Key, Link } from 'lucide-react';

interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default?: string;
  is_primary?: boolean;
  is_foreign?: boolean;
}

interface TableSchemaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string | null;
}

export const TableSchemaModal: React.FC<TableSchemaModalProps> = ({
  open,
  onOpenChange,
  tableName,
}) => {
  const [schema, setSchema] = useState<TableColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && tableName) {
      fetchTableSchema();
    }
  }, [open, tableName]);

  const fetchTableSchema = async () => {
    if (!tableName) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/database/table-schema/${tableName}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.columns) {
          setSchema(result.data.columns);
        } else {
          setSchema([]);
        }
      } else {
        setError('Failed to fetch schema');
      }
    } catch (err) {
      setError('Failed to fetch schema');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tableName} Schema
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{error}</p>
            </div>
          ) : schema.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No schema information available</p>
              <p className="text-sm text-muted-foreground mt-2">
                This may require additional permissions or the table may be empty
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4 py-2 border-b font-medium text-sm">
                <div>Column Name</div>
                <div>Data Type</div>
                <div>Nullable</div>
                <div>Constraints</div>
              </div>
              
              {schema.map((column, index) => (
                <div key={index} className="grid grid-cols-4 gap-4 py-2 items-center">
                  <div className="font-medium">{column.column_name}</div>
                  <div>
                    <Badge variant="outline">{column.data_type}</Badge>
                  </div>
                  <div>
                    <Badge variant={column.is_nullable ? "secondary" : "destructive"}>
                      {column.is_nullable ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {column.is_primary && (
                      <Badge variant="default" className="text-xs">
                        <Key className="h-3 w-3 mr-1" />
                        PK
                      </Badge>
                    )}
                    {column.is_foreign && (
                      <Badge variant="outline" className="text-xs">
                        <Link className="h-3 w-3 mr-1" />
                        FK
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};