package com.zikr;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;
import java.util.ArrayList;
import java.util.List;

public class SurahListFragment extends Fragment {

    private RecyclerView rvSurahs;
    private String folderKey, folderName;
    private DatabaseReference dbRef;
    private List<SurahModel> surahList = new ArrayList<>();

    // Simple Model Class
    class SurahModel {
        String title, arabic, roman, tarjuma;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_surah_list, container, false);

        if (getArguments() != null) {
            folderKey = getArguments().getString("FOLDER_KEY");
            folderName = getArguments().getString("FOLDER_NAME");
        }

        TextView tvTitle = view.findViewById(R.id.tvActiveFolderName);
        tvTitle.setText(folderName + " 📁");

        Button btnBack = view.findViewById(R.id.btnBackToFolders);
        btnBack.setOnClickListener(v -> ((SurahActivity) getActivity()).closeFragmentAndShowFolders());

        rvSurahs = view.findViewById(R.id.rvSurahs);
        rvSurahs.setLayoutManager(new LinearLayoutManager(getContext()));

        // Fetch Surahs for this specific folder
        dbRef = FirebaseDatabase.getInstance().getReference("surah_data").child(folderKey).child("surahs");
        fetchSurahs();

        return view;
    }

    private void fetchSurahs() {
        dbRef.addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                surahList.clear();
                for (DataSnapshot snap : snapshot.getChildren()) {
                    SurahModel sm = new SurahModel();
                    sm.title = snap.child("title").getValue(String.class);
                    sm.arabic = snap.child("arabic").getValue(String.class);
                    sm.roman = snap.child("roman").getValue(String.class);
                    sm.tarjuma = snap.child("tarjuma").getValue(String.class);
                    surahList.add(sm);
                }
                rvSurahs.setAdapter(new SurahAdapter());
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                Toast.makeText(getContext(), "Error loading Surahs", Toast.LENGTH_SHORT).show();
            }
        });
    }

    // --- EXPANDABLE ADAPTER ---
    class SurahAdapter extends RecyclerView.Adapter<SurahAdapter.ViewHolder> {
        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_surah, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            SurahModel sm = surahList.get(position);
            holder.tvTitle.setText(sm.title);
            holder.tvArabic.setText(sm.arabic);
            holder.tvRoman.setText("Roman: \n" + sm.roman);
            holder.tvTarjuma.setText("Tarjuma: \n" + sm.tarjuma);

            // Click to Expand/Collapse
            holder.itemView.setOnClickListener(v -> {
                if (holder.layoutDetails.getVisibility() == View.VISIBLE) {
                    holder.layoutDetails.setVisibility(View.GONE);
                } else {
                    holder.layoutDetails.setVisibility(View.VISIBLE);
                }
            });
        }

        @Override public int getItemCount() { return surahList.size(); }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvTitle, tvArabic, tvRoman, tvTarjuma;
            View layoutDetails;
            ViewHolder(View v) {
                super(v);
                tvTitle = v.findViewById(R.id.tvSurahTitle);
                tvArabic = v.findViewById(R.id.tvArabic);
                tvRoman = v.findViewById(R.id.tvRoman);
                tvTarjuma = v.findViewById(R.id.tvTarjuma);
                layoutDetails = v.findViewById(R.id.layoutSurahDetails);
            }
        }
    }
}
