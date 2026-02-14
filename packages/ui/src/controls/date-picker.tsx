import React, { useState, useEffect } from 'react';
import { TextField } from '@mui/material';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers';
import { PageControl } from '../control';

interface DatePickerProps {
    control: PageControl;
    onChange?: (date: Date | null) => void;
    onBlur?: () => void;
    disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
    control,
    onChange,
    onBlur,
    disabled
}) => {
    const [value, setValue] = useState<Date | null>(control.getValue() || null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setValue(newValue ? new Date(newValue) : null);
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

    const handleChange = (date: Date | null) => {
        setValue(date);
        control.setValue(date);
        onChange?.(date);
    };

    const handleBlur = async () => {
        await control.validate();
        onBlur?.();
    };

    const minDate = control.getProperty('minDate');
    const maxDate = control.getProperty('maxDate');

    return (
        <MuiDatePicker
            label={control.name}
            value={value}
            onChange={handleChange}
            onClose={handleBlur}
            disabled={disabled || !control.isEnabled()}
            slotProps={{
                textField: {
                    fullWidth: true,
                    error: !!error,
                    helperText: error,
                    required: control.isRequired(),
                    size: 'small',
                    onBlur: handleBlur
                }
            }}
            minDate={minDate ? new Date(minDate) : undefined}
            maxDate={maxDate ? new Date(maxDate) : undefined}
        />
    );
};