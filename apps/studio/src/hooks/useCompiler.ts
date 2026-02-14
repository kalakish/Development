import { useState, useCallback } from 'react';
import { CompilerService } from '../services/CompilerService';
import { useNotification } from './useNotification';

interface CompileResult {
    success: boolean;
    diagnostics?: any[];
    outputs?: any[];
    metadata?: any[];
}

export const useCompiler = () => {
    const { showNotification } = useNotification();
    
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
    const [errors, setErrors] = useState<any[]>([]);
    const [warnings, setWarnings] = useState<any[]>([]);

    const compile = useCallback(async (code: string, options?: any) => {
        setIsCompiling(true);
        setErrors([]);
        setWarnings([]);
        
        try {
            const result = await CompilerService.compile(code, options);
            setCompileResult(result);
            
            if (result.diagnostics) {
                setErrors(result.diagnostics.filter((d: any) => d.severity === 'error'));
                setWarnings(result.diagnostics.filter((d: any) => d.severity === 'warning'));
            }
            
            if (result.success) {
                showNotification('Compilation successful', 'success');
            } else {
                showNotification('Compilation failed', 'error');
            }
            
            return result;
        } catch (error) {
            showNotification(`Compilation error: ${error.message}`, 'error');
            throw error;
        } finally {
            setIsCompiling(false);
        }
    }, [showNotification]);

    const compileProject = useCallback(async (projectId: string) => {
        setIsCompiling(true);
        
        try {
            const result = await CompilerService.compileProject(projectId);
            setCompileResult(result);
            return result;
        } catch (error) {
            showNotification(`Project compilation failed: ${error.message}`, 'error');
            throw error;
        } finally {
            setIsCompiling(false);
        }
    }, [showNotification]);

    const getDiagnostics = useCallback((code: string) => {
        return CompilerService.getDiagnostics(code);
    }, []);

    const formatCode = useCallback((code: string) => {
        return CompilerService.formatCode(code);
    }, []);

    const getSuggestions = useCallback((code: string, position: { line: number; column: number }) => {
        return CompilerService.getSuggestions(code, position);
    }, []);

    return {
        isCompiling,
        compileResult,
        errors,
        warnings,
        compile,
        compileProject,
        getDiagnostics,
        formatCode,
        getSuggestions,
        hasErrors: errors.length > 0,
        hasWarnings: warnings.length > 0
    };
};