import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { PageControl } from '../control';

interface NumberBoxProps {
    control: PageControl;
    onChange?: (value: number) => void;
    onBlur?: () => void;
    disabled?: boolean;
}

export const NumberBox: React.FC<NumberBoxProps> = ({
    control,
    onChange,
    onBlur,
    disabled
}) => {
    const [value, setValue] = useState<string>(control.getValue()?.toString() || '');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setValue(newValue?.toString() || '');
        };

        const onValidated = (isValid: boolean, errors: string[]) => {
            setError(errors.length > 0 ? errors[0] : null);
        };

        control.on('valueChanged', onValueChanged);
        control.on('validated', onValidated);

        return () => {
            control.off('valueChanged', onValueChanged);
            control.off('validated', onValidated);
        };
    }, [control]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        
        const numValue = newValue === '' ? null : Number(newValue);
        control.setValue(numValue);
        onChange?.(numValue);
    };

    const handleBlur = async () => {
        await control.validate();
        onBlur?.();
    };

    const min = control.getProperty('min');
    const max = control.getProperty('max');
    const decimals = control.getProperty('decimals') || 0;
    const prefix = control.getProperty('prefix');
    const suffix = control.getProperty('suffix');

    return (
        <TextField
            fullWidth
            type="number"
            label={control.name}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            error={!!error}
            helperText={error}
            disabled={disabled || !control.isEnabled()}
            required={control.isRequired()}
            inputProps={{
                min,
                max,
                step: decimals > 0 ? 0.1 : 1
            }}
            InputProps={{
                startAdornment: prefix && (
                    <InputAdornment position="start">{prefix}</InputAdornment>
                ),
                endAdornment: suffix && (
                    <InputAdornment position="end">{suffix}</InputAdornment>
                )
            }}
            size="small"
        />
    );
};