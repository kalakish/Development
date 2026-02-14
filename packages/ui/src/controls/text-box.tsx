import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { PageControl, ControlType } from '../control';

interface TextBoxProps {
    control: PageControl;
    onChange?: (value: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
}

export const TextBox: React.FC<TextBoxProps> = ({
    control,
    onChange,
    onBlur,
    disabled
}) => {
    const [value, setValue] = useState(control.getValue() || '');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setValue(newValue || '');
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
        control.setValue(newValue);
        onChange?.(newValue);
    };

    const handleBlur = async () => {
        await control.validate();
        onBlur?.();
    };

    const maxLength = control.getProperty('maxLength');
    const multiline = control.getProperty('multiline') || false;
    const placeholder = control.getProperty('placeholder');
    const prefix = control.getProperty('prefix');
    const suffix = control.getProperty('suffix');

    return (
        <TextField
            fullWidth
            label={control.name}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            error={!!error}
            helperText={error}
            disabled={disabled || !control.isEnabled()}
            required={control.isRequired()}
            multiline={multiline}
            rows={multiline ? 4 : 1}
            inputProps={{
                maxLength
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