package com.zikr;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import com.zikr.databinding.ActivityTasbeehBinding;

public class TasbeehActivity extends AppCompatActivity {
    private ActivityTasbeehBinding binding;
    private int count = 0;
    private int zikrIndex = 0;
    
    // Array of different Zikrs
    private String[] zikrList = {
        "SubhanAllah", 
        "Alhamdulillah", 
        "Allahu Akbar", 
        "La ilaha illallah", 
        "Astaghfirullah"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityTasbeehBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // Setup Initial Zikr
        binding.tvCurrentZikr.setText(zikrList[zikrIndex]);

        // Tap Button
        binding.btnCount.setOnClickListener(v -> {
            count++;
            binding.tvCounter.setText(String.valueOf(count));
        });

        // Reset Button
        binding.btnReset.setOnClickListener(v -> {
            count = 0;
            binding.tvCounter.setText(String.valueOf(count));
        });

        // Change Zikr Button
        binding.btnChangeZikr.setOnClickListener(v -> {
            zikrIndex++;
            if(zikrIndex >= zikrList.length) {
                zikrIndex = 0; // Reset to start
            }
            binding.tvCurrentZikr.setText(zikrList[zikrIndex]);
            count = 0; // Reset counter on new Zikr
            binding.tvCounter.setText(String.valueOf(count));
        });
    }
}
