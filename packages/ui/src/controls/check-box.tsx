import React, { useState, useEffect } from 'react';
import { Checkbox, FormControlLabel, FormHelperText, Box } from '@mui/material';
import { PageControl } from '../control';

interface CheckBoxProps {
    control: PageControl;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
}

export const CheckBox: React.FC<CheckBoxProps> = ({
    control,
    onChange,
    disabled
}) => {
    const [checked, setChecked] = useState(control.getValue() === true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setChecked(newValue === true);
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
        const newChecked = e.target.checked;
        setChecked(newChecked);
        control.setValue(newChecked);
        onChange?.(newChecked);
    };

    return (
        <Box>
            <FormControlLabel
                control={
                    <Checkbox
                        checked={checked}
                        onChange={handleChange}
                        disabled={disabled || !control.isEnabled()}
                    />
                }
                label={control.name}
            />
            {error && (
                <FormHelperText error>{error}</FormHelperText>
            )}
        </Box>
    );
};