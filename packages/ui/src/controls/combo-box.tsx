import React, { useState, useEffect } from 'react';
import {
    Autocomplete,
    TextField,
    Chip,
    FormHelperText,
    Box
} from '@mui/material';
import { PageControl } from '../control';

interface Option {
    value: any;
    label: string;
    disabled?: boolean;
}

interface ComboBoxProps {
    control: PageControl;
    onChange?: (value: any) => void;
    onBlur?: () => void;
    disabled?: boolean;
}

export const ComboBox: React.FC<ComboBoxProps> = ({
    control,
    onChange,
    onBlur,
    disabled
}) => {
    const [value, setValue] = useState<any>(control.getValue());
    const [options, setOptions] = useState<Option[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Load options from control
        const controlOptions = control.getProperty('options') || [];
        setOptions(controlOptions);
    }, [control]);

    useEffect(() => {
        const onValueChanged = (newValue: any) => {
            setValue(newValue);
        };

        const onOptionsChanged = (newOptions: Option[]) => {
            setOptions(newOptions);
        };

        const onValidated = (isValid: boolean, errors: string[]) => {
            setError(errors.length > 0 ? errors[0] : null);
        };

        control.on('valueChanged', onValueChanged);
        control.on('optionsChanged', onOptionsChanged);
        control.on('validated', onValidated);

        return () => {
            control.off('valueChanged', onValueChanged);
            control.off('optionsChanged', onOptionsChanged);
            control.off('validated', onValidated);
        };
    }, [control]);

    const handleChange = (event: any, newValue: any) => {
        setValue(newValue);
        control.setValue(newValue?.value ?? newValue);
        onChange?.(newValue?.value ?? newValue);
    };

    const handleBlur = async () => {
        await control.validate();
        onBlur?.();
    };

    const multiple = control.getProperty('multiple') || false;
    const allowCustom = control.getProperty('allowCustom') || false;
    const placeholder = control.getProperty('placeholder');

    // Find selected option(s)
    const selectedValue = multiple
        ? options.filter(opt => 
            Array.isArray(value) && value.includes(opt.value)
          )
        : options.find(opt => opt.value === value) || null;

    return (
        <Box>
            <Autocomplete
                multiple={multiple}
                options={options}
                value={selectedValue}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={disabled || !control.isEnabled()}
                getOptionLabel={(option) => 
                    typeof option === 'string' ? option : option.label
                }
                isOptionEqualToValue={(option, val) => 
                    option.value === (val?.value ?? val)
                }
                filterSelectedOptions
                freeSolo={allowCustom}
                renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                        <Chip
                            label={option.label}
                            size="small"
                            {...getTagProps({ index })}
                        />
                    ))
                }
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={control.name}
                        placeholder={placeholder}
                        error={!!error}
                        helperText={error}
                        required={control.isRequired()}
                        size="small"
                    />
                )}
            />
        </Box>
    );
};